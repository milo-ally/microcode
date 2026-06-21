import { beforeAll, describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import {
  createAssistantMessageEventStream,
  type AssistantMessage,
} from '@earendil-works/pi-ai'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import {
  createMicrocodeAgentRuntime,
  type MicrocodeAgentEvent,
} from '../../src/agent/index.ts'
import type {
  AgentCompactionRecord,
  AgentSessionPersistence,
} from '../../src/agent/persistence.ts'

beforeAll(() => {
  ensureBootstrapMacro()
})

function userMessage(content: string): AgentMessage {
  return {
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

const fakeGenerateSummary = (async () => ({
  ok: true,
  value: 'Event test summary.',
})) as any

describe('MicrocodeAgent unified events', () => {
  test('injects an invisible task reminder into model context only', async () => {
    let modelMessages: AgentMessage[] = []
    const persistence: AgentSessionPersistence = {
      async saveMessages() {},
      async recordCompaction(_record: AgentCompactionRecord) {},
      async getTaskReminder() {
        return '<reminder>\n- [ ] task-1: Finish the work\n</reminder>'
      },
    }
    const response: AssistantMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
      api: 'openai-completions',
      provider: 'test',
      model: 'test-model',
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
      stopReason: 'stop',
      timestamp: Date.now(),
    }
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'task-reminder' },
      persistence,
      streamFn: (_model, context) => {
        modelMessages = [...context.messages]
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          stream.push({ type: 'start', partial: response })
          stream.push({ type: 'done', reason: 'stop', message: response })
        })
        return stream
      },
    })

    await runtime.prompt('continue')

    expect(modelMessages.at(-1)).toMatchObject({
      role: 'user',
      content: '<reminder>\n- [ ] task-1: Finish the work\n</reminder>',
    })
    expect(runtime.getMessages().some(
      (message) => message.role === 'custom'
        && message.customType === 'task-reminder',
    )).toBe(false)
  })

  test('forwards core streaming lifecycle events with agentId', async () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'event-stream' },
      streamFn: () => {
        const stream = createAssistantMessageEventStream()
        queueMicrotask(() => {
          stream.push({ type: 'start', partial: response })
          stream.push({ type: 'done', reason: 'stop', message: response })
        })
        return stream
      },
    })
    const events: MicrocodeAgentEvent[] = []
    runtime.subscribe((event) => events.push(event))
    const response: AssistantMessage = {
      role: 'assistant',
      content: [{ type: 'text', text: 'done' }],
      api: 'openai-completions',
      provider: 'test',
      model: 'test-model',
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
      stopReason: 'stop',
      timestamp: Date.now(),
    }
    await runtime.prompt('run event stream')

    const lifecycleTypes = events
      .filter((event) => [
        'agent_start',
        'message_start',
        'message_end',
        'turn_end',
        'agent_end',
      ].includes(event.type))
      .map((event) => event.type)
    expect(lifecycleTypes).toEqual([
      'agent_start',
      'message_start',
      'message_end',
      'message_start',
      'message_end',
      'turn_end',
      'agent_end',
    ])
    expect(events.every((event) => event.agentId === 'event-stream')).toBe(true)
  })

  test('identifies concurrent agent events by agentId', () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'event-primary' },
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'event-worker', parentId: 'event-primary' },
    })
    const events: MicrocodeAgentEvent[] = []
    primary.subscribe((event) => events.push(event))
    worker.subscribe((event) => events.push(event))

    primary.setThinkingLevel('low')
    worker.setThinkingLevel('high')

    expect(events.filter((event) => event.type === 'state_changed').map((event) => event.agentId))
      .toEqual(['event-primary', 'event-worker'])
  })

  test('emits model, token, and state changes from encapsulated APIs', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'event-state' },
      modelId: 'deepseek-v4-pro',
    })
    const events: MicrocodeAgentEvent[] = []
    runtime.subscribe((event) => events.push(event))

    runtime.replaceMessages([userMessage('new context')], 'rebuild')
    runtime.switchModel('mimo-v2.5', 'openai-completions')

    const modelEvent = events.find((event) => event.type === 'model_changed')
    expect(modelEvent).toMatchObject({
      type: 'model_changed',
      agentId: 'event-state',
      previous: { id: 'deepseek-v4-pro' },
      current: { id: 'mimo-v2.5' },
    })
    expect(events.some((event) => event.type === 'token_usage')).toBe(true)
    expect(events.some(
      (event) => event.type === 'state_changed' && event.reason === 'messages_replaced',
    )).toBe(true)
  })

  test('emits permission request and resolution around the interactive handler', async () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'event-permission' },
    })
    const events: MicrocodeAgentEvent[] = []
    runtime.subscribe((event) => events.push(event))
    runtime.setPermissionRequestHandler(async () => true)

    const result = await runtime.requestToolPermission(
      'bash',
      { command: 'echo event' },
      'Run event command',
    )

    expect(result).toBe(true)
    expect(events.filter(
      (event) => event.type === 'permission_requested' || event.type === 'permission_resolved',
    )).toMatchObject([
      {
        type: 'permission_requested',
        agentId: 'event-permission',
        request: { kind: 'tool', toolName: 'bash' },
      },
      {
        type: 'permission_resolved',
        agentId: 'event-permission',
        allowed: true,
      },
    ])
  })

  test('emits compaction progress and supports unsubscribe', async () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'event-compaction' },
      generateSummaryFn: fakeGenerateSummary,
    })
    const events: MicrocodeAgentEvent[] = []
    const unsubscribe = runtime.subscribe((event) => events.push(event))
    runtime.replaceMessages([
      userMessage('first'),
      userMessage('second'),
      userMessage('third'),
    ])

    await runtime.compact({ persistToSession: false })

    const phases = events
      .filter((event) => event.type === 'compaction_changed')
      .map((event) => event.progress.phase)
    expect(phases).toEqual([
      'analyzing',
      'analyzing',
      'summarizing',
      'validating',
      'validating',
      'committing',
      'done',
    ])
    const progress = events
      .filter((event) => event.type === 'compaction_changed')
      .map((event) => event.progress.progress ?? 0)
    expect(progress).toEqual([...progress].sort((a, b) => a - b))
    expect(progress.at(-1)).toBe(100)
    expect(events.some(
      (event) => event.type === 'state_changed' && event.reason === 'compaction_completed',
    )).toBe(true)

    unsubscribe()
    const count = events.length
    runtime.setThinkingLevel('medium')
    expect(events).toHaveLength(count)
  })

  test('emits live summarization progress while the summary model is running', async () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'live-compaction-progress' },
      generateSummaryFn: (async () => {
        await new Promise((resolve) => setTimeout(resolve, 650))
        return { ok: true, value: 'Delayed compact summary.' }
      }) as any,
    })
    const progress: number[] = []
    runtime.subscribe((event) => {
      if (
        event.type === 'compaction_changed' &&
        event.progress.phase === 'summarizing'
      ) {
        progress.push(event.progress.progress ?? 0)
      }
    })
    runtime.replaceMessages([
      userMessage(`first-${'x'.repeat(1000)}`),
      userMessage('second'),
    ])

    await runtime.compact({ persistToSession: false })

    expect(progress.length).toBeGreaterThanOrEqual(3)
    expect(progress[0]).toBe(20)
    expect(progress.at(-1)).toBeGreaterThan(20)
  })
})
