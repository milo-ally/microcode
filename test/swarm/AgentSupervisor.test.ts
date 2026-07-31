import { beforeAll, expect, test } from 'bun:test'
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
  type AssistantMessageEventStream,
} from '@earendil-works/pi-ai'
import { createMicrocodeAgentRuntime } from '../../src/agent/index.ts'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import { AgentSupervisor } from '../../src/swarm/AgentSupervisor.ts'
import { createGitWorkTreeTool } from '../../src/tools/GitWorkTreeTool/GitWorkTreeTool.ts'
import { createSpawnAgentTool } from '../../src/tools/SpawnAgentTool/SpawnAgentTool.ts'

beforeAll(() => ensureBootstrapMacro())

function response(
  text: string,
  content: AssistantMessage['content'] = [{ type: 'text', text }],
  stopReason: AssistantMessage['stopReason'] = 'stop',
): AssistantMessage {
  return {
    role: 'assistant',
    content,
    api: 'openai-completions',
    provider: 'test',
    model: 'test',
    stopReason,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
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

let toolCallId = 0

function toolCallsStream(
  calls: Array<{ name: string; arguments: Record<string, unknown> }>,
): AssistantMessageEventStream {
  const stream = createAssistantMessageEventStream()
  queueMicrotask(() => {
    const message = response(
      '',
      calls.map((call) => ({
        type: 'toolCall',
        id: `call-${++toolCallId}`,
        ...call,
      })),
      'toolUse',
    )
    stream.push({ type: 'start', partial: message })
    stream.push({ type: 'done', reason: 'toolUse', message })
  })
  return stream
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

test('explicit batch wait produces one final coordinator reply', async () => {
  let supervisor!: AgentSupervisor
  let coordinatorRequests = 0
  const workerStreams: AssistantMessageEventStream[] = []
  let resolveWaitStarted!: () => void
  const waitStarted = new Promise<void>((resolve) => {
    resolveWaitStarted = resolve
  })

  const parent = createMicrocodeAgentRuntime({
    identity: { id: 'coordinator', role: 'coordinator' },
    permission: { mode: 'auto-approve' },
    streamFn: () => {
      coordinatorRequests++
      if (coordinatorRequests === 1) {
        return toolCallsStream([
          { name: 'spawn', arguments: { description: 'one', prompt: 'one' } },
          { name: 'spawn', arguments: { description: 'two', prompt: 'two' } },
        ])
      }
      if (coordinatorRequests === 2) {
        const batchId = supervisor.listAgents()[0]!.task.batchId
        return toolCallsStream([
          {
            name: 'worktree',
            arguments: { action: 'wait', batch_id: batchId },
          },
        ])
      }
      return completedStream(`final-${coordinatorRequests - 2}`)
    },
  })

  supervisor = new AgentSupervisor({
    coordinator: parent,
    maxWorkers: 2,
    createWorker: ({ agentId, request }) => createMicrocodeAgentRuntime({
      identity: { id: agentId, parentId: request.parentAgentId },
      permission: { mode: 'auto-approve' },
      streamFn: () => {
        const stream = createAssistantMessageEventStream()
        workerStreams.push(stream)
        return stream
      },
    }),
  })
  parent.addTools([
    createSpawnAgentTool(supervisor, parent.getId()),
    createGitWorkTreeTool(supervisor),
  ])
  const unsubscribe = parent.subscribe((event) => {
    if (
      event.type === 'tool_execution_start' &&
      event.toolName === 'worktree'
    ) {
      resolveWaitStarted()
    }
  })

  try {
    const run = parent.prompt('delegate twice, then wait')
    await Promise.race([
      waitStarted,
      Bun.sleep(1000).then(() => {
        throw new Error('wait tool did not start')
      }),
    ])
    expect(workerStreams).toHaveLength(2)
    workerStreams.forEach((stream, index) => {
      const message = response(`worker-${index + 1}`)
      stream.push({ type: 'start', partial: message })
      stream.push({ type: 'done', reason: 'stop', message })
    })
    await run

    const finalTexts = parent.getMessages()
      .filter((message) => message.role === 'assistant')
      .flatMap((message) =>
        (message as AssistantMessage).content
          .filter((block) => block.type === 'text')
          .map((block) => block.text)
      )
      .filter((text) => text.startsWith('final-'))
    const notifications = parent.getMessages().filter((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    )

    expect(new Set(
      supervisor.listAgents().map(({ task }) => task.batchId),
    ).size).toBe(1)
    expect(finalTexts).toEqual(['final-1'])
    expect(coordinatorRequests).toBe(3)
    expect(notifications).toHaveLength(0)
  } finally {
    unsubscribe()
    await supervisor.shutdown()
  }
})

test('cancelled batch wait restores automatic result delivery', async () => {
  const workerStreams: AssistantMessageEventStream[] = []
  const parent = createMicrocodeAgentRuntime({
    identity: { id: 'coordinator', role: 'coordinator' },
    streamFn: () => completedStream('handled automatically'),
  })
  const supervisor = new AgentSupervisor({
    coordinator: parent,
    createWorker: ({ agentId, request }) => createMicrocodeAgentRuntime({
      identity: { id: agentId, parentId: request.parentAgentId },
      streamFn: () => {
        const stream = createAssistantMessageEventStream()
        workerStreams.push(stream)
        return stream
      },
    }),
  })

  try {
    const task = await supervisor.spawn({
      parentAgentId: parent.getId(),
      description: 'one',
      prompt: 'one',
    })
    await waitFor(() => workerStreams.length === 1)

    const controller = new AbortController()
    const waiting = supervisor.waitForBatch(task.batchId, {
      signal: controller.signal,
    })
    controller.abort()
    await expect(waiting).rejects.toThrow('was cancelled')

    const result = response('worker result')
    workerStreams[0]!.push({ type: 'start', partial: result })
    workerStreams[0]!.push({ type: 'done', reason: 'stop', message: result })

    await waitFor(() => supervisor.getTask(task.id)?.status === 'completed')
    await waitFor(() => parent.getMessages().some((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    ))
    await parent.waitForIdle()

    const notifications = parent.getMessages().filter((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('<agent-results')
    )
    expect(notifications).toHaveLength(1)
  } finally {
    await supervisor.shutdown()
  }
})
