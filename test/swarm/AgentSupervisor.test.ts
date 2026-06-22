import { beforeAll, describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
} from '@earendil-works/pi-ai'
import {
  createMicrocodeAgentRuntime,
  type MicrocodeAgent,
} from '../../src/agent/index.ts'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import {
  AgentSupervisor,
  type AgentBatch,
  type AgentTask,
  type AgentTranscriptPersistence,
} from '../../src/swarm/index.ts'

beforeAll(() => ensureBootstrapMacro())

function response(
  text: string,
  stopReason: 'stop' | 'aborted' | 'error' = 'stop',
): AssistantMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text }],
    api: 'openai-completions',
    provider: 'test',
    model: 'test',
    usage: {
      input: 2,
      output: 3,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 5,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
    },
    stopReason,
    timestamp: Date.now(),
  }
}

function completedStream(text: string): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => {
    const message = response(text)
    stream.push({ type: 'start', partial: message })
    stream.push({ type: 'done', reason: 'stop', message })
  })
  return stream
}

function toolCallStream(
  id: string,
  name: string,
  args: Record<string, unknown>,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => {
    const message: AssistantMessage = {
      ...response(''),
      content: [{ type: 'toolCall', id, name, arguments: args }],
      stopReason: 'toolUse',
    }
    stream.push({ type: 'start', partial: message })
    stream.push({ type: 'done', reason: 'toolUse', message })
  })
  return stream
}

function coordinator(): MicrocodeAgent {
  return createMicrocodeAgentRuntime({
    identity: { id: 'coordinator', role: 'coordinator' },
    streamFn: () => completedStream('coordinator handled result'),
  })
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs = 1000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Timed out waiting for condition')
    await Bun.sleep(5)
  }
}

class MemoryAgentPersistence implements AgentTranscriptPersistence {
  manifests: AgentTask[][] = []
  batches: AgentBatch[][] = []
  transcripts = new Map<string, readonly AgentMessage[]>()

  async saveAgentManifest(
    tasks: readonly AgentTask[],
    batches: readonly AgentBatch[] = [],
  ): Promise<void> {
    this.manifests.push(tasks.map((task) => ({
      ...task,
      usage: { ...task.usage },
    })))
    this.batches.push(batches.map((batch) => ({
      ...batch,
      taskIds: [...batch.taskIds],
    })))
  }

  async loadAgentManifest(): Promise<AgentTask[]> {
    return this.manifests.at(-1) ?? []
  }

  async loadAgentBatches(): Promise<AgentBatch[]> {
    return this.batches.at(-1) ?? []
  }

  async saveAgentTranscript(
    agentId: string,
    messages: readonly AgentMessage[],
  ): Promise<void> {
    this.transcripts.set(agentId, [...messages])
  }
}

describe('AgentSupervisor', () => {
  test('completes a worker, persists it, and notifies the coordinator once', async () => {
    const parent = coordinator()
    const persistence = new MemoryAgentPersistence()
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      persistence,
      notifyDebounceMs: 0,
      createWorker: ({ agentId, request }) => createMicrocodeAgentRuntime({
        identity: {
          id: agentId,
          parentId: request.parentAgentId,
          role: 'worker',
        },
        streamFn: () => completedStream('worker result'),
      }),
    })
    const task = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'Research',
      prompt: 'Research the issue',
    })
    await waitFor(() => supervisor.getTask(task.id)?.status === 'completed')
    await parent.waitForIdle()

    expect(supervisor.getTask(task.id)).toMatchObject({
      status: 'completed',
      result: 'worker result',
      usage: { tokens: 5 },
    })
    expect(persistence.transcripts.has(task.agentId)).toBe(true)
    const notifications = parent.getMessages().filter(
      (message) => message.role === 'user' &&
        typeof message.content === 'string' &&
        message.content.includes('<agent-results') &&
        message.content.includes(`<task-id>${task.id}</task-id>`),
    )
    expect(notifications).toHaveLength(1)
    await supervisor.shutdown()
  })

  test('all agents run in parallel (no write serialization)', async () => {
    const parent = coordinator()
    const streams: AssistantMessageEventStream[] = []
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      maxWorkers: 3,
      createWorker: ({ agentId, request }) => {
        const worker = createMicrocodeAgentRuntime({
          identity: { id: agentId, parentId: request.parentAgentId },
          permission: { mode: 'auto-approve' },
          streamFn: () => {
            const stream = createAssistantMessageEventStream()
            streams.push(stream)
            return stream
          },
        })
        if (request.tools) {
          const allowed = new Set(request.tools)
          const toRemove = worker.getSnapshot().toolNames.filter((name) => !allowed.has(name))
          worker.removeTools(toRemove)
        }
        return worker
      },
    })
    const first = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'Writer one',
      prompt: 'write one',
      tools: ['read', 'edit', 'write'],
    })
    const second = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'Writer two',
      prompt: 'write two',
      tools: ['read', 'edit', 'write'],
    })
    const reader = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'Reader',
      prompt: 'read',
      tools: ['read'],
    })
    // All three should start immediately — no write serialization.
    await waitFor(() => streams.length >= 3)
    expect(supervisor.getTask(first.id)?.status).toBe('running')
    expect(supervisor.getTask(second.id)?.status).toBe('running')
    expect(supervisor.getTask(reader.id)?.status).toBe('running')

    const done = response('done')
    for (const stream of streams.slice(0, 2)) {
      stream.push({ type: 'start', partial: done })
      stream.push({ type: 'done', reason: 'stop', message: done })
    }
    await waitFor(() => supervisor.getTask(first.id)?.status === 'completed')
    expect(supervisor.getRunningCount()).toBeLessThanOrEqual(3)

    for (const stream of streams.slice(1)) {
      stream.push({ type: 'start', partial: done })
      stream.push({ type: 'done', reason: 'stop', message: done })
    }
    await waitFor(() => supervisor.getTask(second.id)?.status === 'completed')
    await supervisor.shutdown()
  })

  test('delivers one batch only after every worker reaches a terminal state', async () => {
    const parent = coordinator()
    const streams: AssistantMessageEventStream[] = []
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      maxWorkers: 3,
      createWorker: ({ agentId, request }) => {
        const worker = createMicrocodeAgentRuntime({
          identity: { id: agentId, parentId: request.parentAgentId },
          permission: { mode: 'auto-approve' },
          streamFn: () => {
            const stream = createAssistantMessageEventStream()
            streams.push(stream)
            return stream
          },
        })
        worker.removeTools(['edit', 'write'])
        return worker
      },
    })
    const tasks = await Promise.all([
      supervisor.spawn({
        parentAgentId: parent.getId(),
        description: 'one',
        prompt: 'one',
      }),
      supervisor.spawn({
        parentAgentId: parent.getId(),
        description: 'two',
        prompt: 'two',
      }),
      supervisor.spawn({
        parentAgentId: parent.getId(),
        description: 'three',
        prompt: 'three',
      }),
    ])
    expect(new Set(tasks.map((task) => task.batchId)).size).toBe(1)
    await waitFor(() => streams.length === 3)

    for (const stream of streams.slice(0, 2)) {
      const done = response('partial batch result')
      stream.push({ type: 'start', partial: done })
      stream.push({ type: 'done', reason: 'stop', message: done })
    }
    await waitFor(() =>
      tasks.slice(0, 2).every((task) =>
        supervisor.getTask(task.id)?.status === 'completed'
      )
    )
    expect(parent.getMessages().some((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    )).toBe(false)

    const final = response('final result <safe> & complete')
    streams[2]!.push({ type: 'start', partial: final })
    streams[2]!.push({ type: 'done', reason: 'stop', message: final })
    await parent.waitForIdle()
    await waitFor(() => parent.getMessages().some((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    ))
    const notifications = parent.getMessages().filter((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    )
    expect(notifications).toHaveLength(1)
    const content = String(notifications[0]!.content)
    for (const task of tasks) expect(content).toContain(task.id)
    expect(content).toContain('&lt;safe&gt; &amp; complete')
    await supervisor.shutdown()
  })

  test('waits for a batch through task events without polling', async () => {
    const parent = coordinator()
    const streams: AssistantMessageEventStream[] = []
    const progress: Array<{ completed: number; total: number }> = []
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      maxWorkers: 2,
      createWorker: ({ agentId, request }) => createMicrocodeAgentRuntime({
        identity: { id: agentId, parentId: request.parentAgentId },
        streamFn: () => {
          const stream = createAssistantMessageEventStream()
          streams.push(stream)
          return stream
        },
      }),
    })
    const first = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'one',
      prompt: 'one',
    })
    await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'two',
      prompt: 'two',
    })
    await waitFor(() => streams.length === 2)

    const waiting = supervisor.waitForBatch(first.batchId, {
      onProgress: ({ completed, total }) => progress.push({ completed, total }),
    })
    const done = response('done')
    streams[0]!.push({ type: 'start', partial: done })
    streams[0]!.push({ type: 'done', reason: 'stop', message: done })
    await waitFor(() => progress.some((item) => item.completed === 1))
    streams[1]!.push({ type: 'start', partial: done })
    streams[1]!.push({ type: 'done', reason: 'stop', message: done })

    const tasks = await waiting
    expect(tasks).toHaveLength(2)
    expect(tasks.every((task) => task.status === 'completed')).toBe(true)
    expect(progress.at(-1)).toEqual({ completed: 2, total: 2 })
    await supervisor.shutdown()
  })

  test('completes worker and allows retry via message', async () => {
    const parent = coordinator()
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      createWorker: ({ agentId, request }) => createMicrocodeAgentRuntime({
        identity: { id: agentId, parentId: request.parentAgentId },
        permission: { mode: 'auto-approve' },
        streamFn: () => completedStream('Done.'),
      }),
    })
    const first = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'Simple task',
      prompt: 'Do it',
     
    })
    await waitFor(() => supervisor.getTask(first.id)?.status === 'completed')
    expect(supervisor.getTask(first.id)?.result).toBe('Done.')
    await supervisor.send(first.agentId, 'Do more.')
    await waitFor(() => {
      const latest = supervisor.listAgents().find(
        (state) => state.task.agentId === first.agentId,
      )?.task
      return latest?.status === 'completed' && latest?.id !== first.id
    })
    const latest = supervisor.listAgents().find(
      (state) => state.task.agentId === first.agentId,
    )!.task
    expect(latest.agentId).toBe(first.agentId)
    expect(latest.id).not.toBe(first.id)
    expect(latest.batchId).not.toBe(first.batchId)
    await supervisor.shutdown()
  })

  test('aggregates completed and failed workers in one result', async () => {
    const parent = coordinator()
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      maxWorkers: 3,
      createWorker: ({ agentId, request }) => {
        return createMicrocodeAgentRuntime({
          identity: { id: agentId, parentId: request.parentAgentId },
          permission: { mode: 'auto-approve' },
          streamFn: () => {
            if (request.description === 'failed') {
              const stream = createAssistantMessageEventStream()
              queueMicrotask(() => {
                const message = {
                  ...response('', 'error'),
                  errorMessage: 'worker exploded',
                }
                stream.push({ type: 'start', partial: message })
                stream.push({ type: 'done', reason: 'error', message })
              })
              return stream
            }
            return completedStream('complete')
          },
        })
      },
    })
    await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'complete',
      prompt: 'ok',
    })
    await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'failed',
      prompt: 'doom',
    })
    await parent.waitForIdle()
    await Bun.sleep(10)
    const notification = parent.getMessages().find((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    )
    const content = String(notification?.content)
    expect(content).toContain('<status>completed</status>')
    expect(content).toContain('<status>failed</status>')
    expect(content).toContain('worker exploded')
    await supervisor.shutdown()
  })

  test('does not redeliver a persisted delivered batch', async () => {
    const persistence = new MemoryAgentPersistence()
    persistence.manifests.push([{
      id: 'done-task',
      batchId: 'done-batch',
      agentId: 'done-agent',
      parentAgentId: 'coordinator',
      description: 'Done',
      prompt: 'done',
      role: 'worker',
     
      status: 'completed',
      result: 'done',
      blockers: [],
      createdAt: 1,
      completedAt: 2,
      usage: { tokens: 1, toolCalls: 0 },
    }])
    persistence.batches.push([{
      id: 'done-batch',
      coordinatorTurnId: 'old-turn',
      status: 'delivered',
      taskIds: ['done-task'],
      createdAt: 1,
      sealedAt: 2,
    }])
    const parent = coordinator()
    const supervisor = new AgentSupervisor({ coordinator: parent, persistence })
    await supervisor.restore()
    await Bun.sleep(10)
    expect(parent.getMessages().some((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    )).toBe(false)
    await supervisor.shutdown()
  })

  test('rejects recursive spawning and marks restored work interrupted', async () => {
    const persistence = new MemoryAgentPersistence()
    persistence.manifests.push([{
      id: 'old-task',
      agentId: 'old-agent',
      parentAgentId: 'coordinator',
      description: 'Old work',
      prompt: 'old',
      role: 'worker',
     
      status: 'running',
      createdAt: 1,
      usage: { tokens: 0, toolCalls: 0 },
    }])
    const parent = coordinator()
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      persistence,
    })
    await supervisor.restore()
    expect(supervisor.getTask('old-task')?.status).toBe('interrupted')
    await expect(supervisor.spawn({
      parentAgentId: 'some-worker',
      description: 'Nested',
      prompt: 'nested',
    })).rejects.toThrow('Workers cannot create child agents')
    await supervisor.shutdown()
  })

  test('times out and aborts a worker', async () => {
    const parent = coordinator()
    const supervisor = new AgentSupervisor({
      coordinator: parent,
      timeoutMs: 20,
      createWorker: ({ agentId, request }) => createMicrocodeAgentRuntime({
        identity: { id: agentId, parentId: request.parentAgentId },
        streamFn: (_model, _context, options) => {
          const stream = createAssistantMessageEventStream()
          options.signal?.addEventListener('abort', () => {
            const aborted = response('aborted', 'aborted')
            stream.push({ type: 'start', partial: aborted })
            stream.push({ type: 'done', reason: 'aborted', message: aborted })
          }, { once: true })
          return stream
        },
      }),
    })
    const task = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'Slow task',
      prompt: 'wait forever',
    })
    await waitFor(() => supervisor.getTask(task.id)?.status === 'failed')
    expect(supervisor.getTask(task.id)?.error).toContain('Timed out')
    await supervisor.shutdown()
  })
})
