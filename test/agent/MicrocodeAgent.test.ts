import { beforeAll, describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import { Type } from 'typebox'
import { join } from 'path'
import type {
  AgentCompactionRecord,
  AgentSessionPersistence,
} from '../../src/agent/persistence.ts'
import {
  createMicrocodeAgentRuntime,
} from '../../src/agent/index.ts'

beforeAll(() => {
  ensureBootstrapMacro()
})

const SKILL_FIXTURES = join(import.meta.dir, '..', 'fixtures', 'skills')

function userMessage(content: string): AgentMessage {
  return {
    role: 'user',
    content,
    timestamp: Date.now(),
  }
}

function assistantMessage(responseId: string, input: number): AgentMessage {
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'done' }],
    api: 'openai-completions',
    provider: 'deepseek',
    model: 'deepseek-v4-pro',
    responseId,
    usage: {
      input,
      output: 5,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: input + 5,
      cost: {
        input: 0.01,
        output: 0.01,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0.02,
      },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

function assistantToolCallMessage(
  calls: Array<{ id: string; name: string }>,
): AgentMessage {
  return {
    ...assistantMessage(`tools-${calls.map((call) => call.id).join('-')}`, 10),
    content: calls.map((call) => ({
      type: 'toolCall' as const,
      id: call.id,
      name: call.name,
      arguments: {},
    })),
    stopReason: 'toolUse',
  }
}

function toolResultMessage(
  toolCallId: string,
  toolName: string,
  text: string,
): AgentMessage {
  return {
    role: 'toolResult',
    toolCallId,
    toolName,
    content: [{ type: 'text', text }],
    isError: false,
    timestamp: Date.now(),
  }
}

function externalTool(name: string, label: string) {
  return {
    name,
    label,
    description: label,
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: 'text' as const, text: label }], details: {} }
    },
  }
}

class MemoryPersistence implements AgentSessionPersistence {
  saved: readonly AgentMessage[][] = []
  records: AgentCompactionRecord[] = []

  async saveMessages(messages: readonly AgentMessage[]): Promise<void> {
    this.saved = [...this.saved, [...messages]]
  }

  async recordCompaction(record: AgentCompactionRecord): Promise<void> {
    this.records.push(record)
  }
}

const fakeGenerateSummary = (async () => ({
  ok: true,
  value: 'Compact summary for testing.',
})) as any

describe('MicrocodeAgent phase 1 boundary', () => {
  test('creates a typed identity and readonly state snapshot', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: {
        id: 'primary',
        name: 'Primary',
        role: 'coordinator',
      },
    })

    expect(runtime.getId()).toBe('primary')
    expect(runtime.getIdentity()).toEqual({
      id: 'primary',
      name: 'Primary',
      role: 'coordinator',
      parentId: undefined,
    })

    const snapshot = runtime.getSnapshot()
    expect(snapshot.identity.id).toBe('primary')
    expect(snapshot.messageCount).toBe(0)
    expect(snapshot.toolNames.length).toBeGreaterThan(0)
    expect(snapshot.permission.mode).toBe('interactive')
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.identity)).toBe(true)
  })

  test('keeps message state isolated between agent instances', () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'primary' },
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'worker-1', parentId: 'primary' },
    })

    primary.replaceMessages([userMessage('primary context')])
    worker.replaceMessages([userMessage('worker context')])

    expect(primary.getMessages()).toHaveLength(1)
    expect(worker.getMessages()).toHaveLength(1)
    expect((primary.getMessages()[0] as any).content).toBe('primary context')
    expect((worker.getMessages()[0] as any).content).toBe('worker context')

    const externalCopy = primary.getMessages() as AgentMessage[]
    externalCopy.push(userMessage('must not leak back'))
    expect(primary.getMessages()).toHaveLength(1)
  })

  test('creates an isolated permission manager for every runtime', () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'permission-primary' },
      permission: {
        mode: 'interactive',
        deny: ['bash(rm:*)'],
      },
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'permission-worker', parentId: 'permission-primary' },
      permission: { mode: 'plan' },
    })

    expect(primary.getPermissionMode()).toBe('interactive')
    expect(worker.getPermissionMode()).toBe('plan')
    expect(
      primary.checkPermission('bash', { command: 'rm -rf ./build' }),
    ).toEqual({
      allowed: false,
      reason: 'Tool "bash" denied by rule: bash(rm:*)',
    })

    primary.setPermissionMode('auto-approve')
    expect(primary.getPermissionMode()).toBe('auto-approve')
    expect(worker.getPermissionMode()).toBe('plan')
  })

  test('does not inherit parent session permissions', () => {
    const parent = createMicrocodeAgentRuntime({
      identity: { id: 'parent' },
    })
    const child = createMicrocodeAgentRuntime({
      identity: { id: 'child', parentId: 'parent' },
    })

    parent.addSessionPermission('bash', 'npm test')

    expect(parent.checkPermission('bash', { command: 'npm test' }))
      .toEqual({ allowed: true })
    expect(child.checkPermission('bash', { command: 'npm test' }))
      .toEqual({ allowed: false, reason: 'ask' })
  })

  test('returns an immutable permission snapshot', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'snapshot' },
      permission: {
        allow: ['file_read'],
        deny: ['bash'],
      },
    })

    const snapshot = runtime.getPermissionSnapshot()
    expect(Object.isFrozen(snapshot)).toBe(true)
    expect(Object.isFrozen(snapshot.allowRules)).toBe(true)
    expect(Object.isFrozen(snapshot.allowRules[0])).toBe(true)
    expect(runtime.getSnapshot().permission).toEqual(snapshot)

    expect(runtime.getPermissionSnapshot().allowRules).toHaveLength(1)
  })

  test('always enforces the instance permission policy', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'hooked' },
      permission: { deny: ['bash'] },
    })

    expect(runtime.checkPermission('bash', { command: 'echo blocked' })).toEqual({
      allowed: false,
      reason: 'Tool "bash" denied by rule: bash',
    })
  })

  test('supports explicit delegation for non-interactive child agents', async () => {
    const delegated: string[] = []
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'delegated-child', parentId: 'parent' },
      permission: {
        nonInteractiveStrategy: 'delegate-to-parent',
        onDelegatePermissionRequest: async (toolName) => {
          delegated.push(toolName)
          return true
        },
      },
    })

    const result = await runtime.requestDelegatedPermission(
      'bash',
      { command: 'echo safe' },
      'Run safe command',
    )

    expect(result).toBe(true)
    expect(delegated).toEqual(['bash'])
  })

  test('rebuilds or preserves token usage according to message replacement intent', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'token-runtime' },
    })
    const firstSession = [assistantMessage('first-session', 20)]
    runtime.replaceMessages(firstSession, 'rebuild')
    expect(runtime.getTokenStats().session.inputTokens).toBe(20)

    runtime.replaceMessages([userMessage('compacted summary')], 'preserve')
    expect(runtime.getTokenStats().session.inputTokens).toBe(20)
    expect(runtime.getTokenStats().context.messageTokens).toBeLessThan(20)

    runtime.replaceMessages([assistantMessage('second-session', 7)], 'rebuild')
    expect(runtime.getTokenStats().session.requests).toBe(1)
    expect(runtime.getTokenStats().session.inputTokens).toBe(7)

    runtime.clearMessages()
    expect(runtime.getTokenStats().session.requests).toBe(0)
  })

  test('keeps token and cost ledgers isolated between agent instances', () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'token-primary' },
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'token-worker', parentId: 'token-primary' },
    })

    primary.replaceMessages([assistantMessage('primary-usage', 30)], 'rebuild')
    worker.replaceMessages([assistantMessage('worker-usage', 4)], 'rebuild')

    expect(primary.getTokenStats().session.inputTokens).toBe(30)
    expect(worker.getTokenStats().session.inputTokens).toBe(4)
    expect(primary.getTokenStats().session.totalCost).toBe(0.02)
    expect(worker.getTokenStats().session.totalCost).toBe(0.02)
  })

  test('switches model capabilities, prompt, compaction, and token focus together', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'model-switch' },
      modelId: 'deepseek-v4-pro',
    })
    runtime.replaceMessages([assistantMessage('deepseek-history', 12)], 'rebuild')

    expect(runtime.getSnapshot().toolNames).not.toContain('vision')
    const switched = runtime.switchModel('mimo-v2.5', 'openai-completions')
    const snapshot = runtime.getSnapshot()

    expect(switched.model.id).toBe('mimo-v2.5')
    expect(switched.model.api).toBe('openai-completions')
    expect(snapshot.model.id).toBe('mimo-v2.5')
    expect(snapshot.toolNames).toContain('vision')
    expect(snapshot.systemPrompt).toContain('model mimo-v2.5')
    expect(snapshot.tokens.context.contextWindow).toBe(1_000_000)
    expect(snapshot.tokens.currentModel.modelId).toBe('mimo-v2.5')
    expect(snapshot.tokens.currentModel.requests).toBe(0)
    expect(snapshot.tokens.byModel['deepseek:openai-completions:deepseek-v4-pro'].requests).toBe(1)
  })

  test('supports explicit API selection for duplicate model IDs', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'protocol-switch' },
      modelId: 'deepseek-v4-pro',
    })

    const snapshot = runtime.switchModel('deepseek-v4-flash', 'anthropic-messages')

    expect(snapshot.model.id).toBe('deepseek-v4-flash')
    expect(snapshot.model.api).toBe('anthropic-messages')
    expect(runtime.getSnapshot().model.api).toBe('anthropic-messages')
  })

  test('keeps model selection isolated between agent instances', () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'model-primary' },
      modelId: 'deepseek-v4-pro',
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'model-worker', parentId: 'model-primary' },
      modelId: 'gemini-2.5-flash',
    })

    primary.switchModel('deepseek-v4-flash', 'openai-completions')

    expect(primary.getModelSnapshot().model.id).toBe('deepseek-v4-flash')
    expect(worker.getModelSnapshot().model.id).toBe('gemini-2.5-flash')
    expect(worker.getModelSnapshot().model.api).toBe('google-generative-ai')
  })

  test('keeps all model-dependent state unchanged when switching fails', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'failed-switch' },
      modelId: 'deepseek-v4-pro',
    })
    const before = runtime.getSnapshot()

    expect(() => runtime.switchModel('missing-model')).toThrow(
      'Model "missing-model" was not found.',
    )

    const after = runtime.getSnapshot()
    expect(after.model).toEqual(before.model)
    expect(after.toolNames).toEqual(before.toolNames)
    expect(after.systemPrompt).toBe(before.systemPrompt)
    expect(after.tokens.context).toEqual(before.tokens.context)
  })

  test('rejects an invalid initial model instead of falling back globally', () => {
    expect(() => createMicrocodeAgentRuntime({
      identity: { id: 'invalid-initial-model' },
      modelId: 'missing-model',
    })).toThrow('Model "missing-model" was not found.')
  })

  test('manages thinking level through the model manager', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'thinking-level' },
      thinkingLevel: 'low',
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'thinking-worker', parentId: 'thinking-level' },
      thinkingLevel: 'medium',
    })

    expect(runtime.getModelSnapshot().thinkingLevel).toBe('low')
    runtime.setThinkingLevel('high')
    expect(runtime.getModelSnapshot().thinkingLevel).toBe('high')
    expect(runtime.getSnapshot().thinkingLevel).toBe('high')
    expect(worker.getThinkingLevel()).toBe('medium')
  })

  test('preserves and deduplicates external tools across model switches', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'external-tools' },
      modelId: 'deepseek-v4-pro',
    })

    runtime.addTools([externalTool('resource', 'first')])
    runtime.addTools([externalTool('resource', 'replacement')])
    expect(runtime.getToolSnapshot().external).toEqual(['resource'])
    expect(runtime.hasTool('resource')).toBe(true)

    runtime.switchModel('mimo-v2.5', 'openai-completions')
    expect(runtime.hasTool('resource')).toBe(true)
    expect(runtime.getToolSnapshot().core).toContain('vision')

    runtime.removeTools(['resource'])
    expect(runtime.hasTool('resource')).toBe(false)
  })

  test('keeps tool collections isolated between agent instances', () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'tool-primary' },
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'tool-worker', parentId: 'tool-primary' },
    })

    primary.addTools([externalTool('primary-only', 'primary')])

    expect(primary.hasTool('primary-only')).toBe(true)
    expect(worker.hasTool('primary-only')).toBe(false)
  })

  test('loads and unloads skills while synchronizing prompt token usage', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'skill-token-sync' },
      skillPaths: [SKILL_FIXTURES],
    })
    const before = runtime.getTokenStats().context.systemPromptTokens

    runtime.loadSkill('phase-six-alpha')
    const loaded = runtime.getTokenStats().context.systemPromptTokens
    expect(runtime.getSnapshot().systemPrompt).toContain('# Skill: phase-six-alpha')
    expect(runtime.getSkillSnapshot().loaded.map((skill) => skill.name)).toContain(
      'phase-six-alpha',
    )
    expect(loaded).toBeGreaterThan(before)

    runtime.unloadSkill('phase-six-alpha')
    expect(runtime.getSnapshot().systemPrompt).not.toContain('# Skill: phase-six-alpha')
    expect(runtime.getTokenStats().context.systemPromptTokens).toBe(before)
  })

  test('keeps loaded skills isolated between agent instances', () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'skill-primary' },
      skillPaths: [join(SKILL_FIXTURES, 'alpha')],
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'skill-worker', parentId: 'skill-primary' },
      skillPaths: [join(SKILL_FIXTURES, 'beta')],
    })

    primary.loadSkill('phase-six-alpha')
    worker.loadSkill('phase-six-beta')

    expect(primary.getLoadedSkillNames()).toEqual(['phase-six-alpha'])
    expect(worker.getLoadedSkillNames()).toEqual(['phase-six-beta'])
    expect(primary.getSnapshot().systemPrompt).not.toContain('# Skill: phase-six-beta')
    expect(worker.getSnapshot().systemPrompt).not.toContain('# Skill: phase-six-alpha')
  })

  test('preserves loaded skill content when rebuilding the prompt for a model switch', () => {
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'skill-model-switch' },
      skillPaths: [join(SKILL_FIXTURES, 'alpha')],
      modelId: 'deepseek-v4-pro',
    })
    runtime.loadSkill('phase-six-alpha')

    runtime.switchModel('mimo-v2.5', 'openai-completions')

    expect(runtime.getSnapshot().systemPrompt).toContain('model mimo-v2.5')
    expect(runtime.getSnapshot().systemPrompt).toContain('# Skill: phase-six-alpha')
    expect(runtime.getLoadedSkillNames()).toEqual(['phase-six-alpha'])
  })

  test('persists runtime messages through the agent boundary', async () => {
    const persistence = new MemoryPersistence()
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'runtime-persistence' },
      persistence,
    })
    const messages = [userMessage('persist this runtime')]
    runtime.replaceMessages(messages, 'rebuild')

    await runtime.persistMessages()

    expect(persistence.saved).toEqual([messages])
  })

  test('manually compacts through the agent persistence boundary', async () => {
    const persistence = new MemoryPersistence()
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'manual-compaction' },
      persistence,
      generateSummaryFn: fakeGenerateSummary,
    })
    const messages: AgentMessage[] = Array.from({ length: 10 }, (_, index) =>
      userMessage(`message-${index}-${'x'.repeat(200)}`),
    )
    messages.push(assistantMessage('compaction-usage', 30))
    runtime.replaceMessages(messages, 'rebuild')
    const usageBefore = runtime.getTokenStats().session.inputTokens

    const result = await runtime.compact({
      instructions: 'Keep implementation details.',
      persistToSession: true,
    })

    expect(result.automatic).toBe(false)
    expect(result.messages.length).toBeLessThan(messages.length)
    expect(runtime.getMessages()).toEqual([...result.messages])
    expect(runtime.getTokenStats().session.inputTokens).toBe(usageBefore)
    expect(persistence.saved).toHaveLength(1)
    expect(persistence.saved[0]).toHaveLength(messages.length)
    expect(persistence.records).toHaveLength(1)
    expect(persistence.records[0]).toMatchObject({
      summary: 'Compact summary for testing.',
      automatic: false,
      compactedMessageCount: result.messages.length,
    })
  })

  test('keeps parallel tool calls and results as one indivisible compact unit', async () => {
    let summarizedMessages: AgentMessage[] = []
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'tool-boundary-compaction' },
      generateSummaryFn: (async (messages: AgentMessage[]) => {
        summarizedMessages = messages
        return { ok: true, value: 'Tool boundary summary.' }
      }) as any,
    })
    const toolCall = assistantToolCallMessage([
      { id: 'call-a', name: 'read' },
      { id: 'call-b', name: 'grep' },
    ])
    const messages: AgentMessage[] = [
      userMessage(`old-1-${'x'.repeat(1000)}`),
      userMessage(`old-2-${'x'.repeat(1000)}`),
      userMessage(`old-3-${'x'.repeat(1000)}`),
      userMessage(`old-4-${'x'.repeat(1000)}`),
      toolCall,
      toolResultMessage('call-a', 'read', 'read result'),
      toolResultMessage('call-b', 'grep', 'grep result'),
    ]
    runtime.replaceMessages(messages)

    const result = await runtime.compact({ persistToSession: false })

    expect(result.messages.slice(-3).map((message) => message.role)).toEqual([
      'assistant',
      'toolResult',
      'toolResult',
    ])
    expect(summarizedMessages).not.toContain(toolCall)
    expect(result.keptMessageCount).toBe(3)
  })

  test('converts an orphan tool result to summary text instead of retaining it', async () => {
    let summarizedMessages: AgentMessage[] = []
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'orphan-tool-result-compaction' },
      generateSummaryFn: (async (messages: AgentMessage[]) => {
        summarizedMessages = messages
        return { ok: true, value: 'Recovered malformed history.' }
      }) as any,
    })
    runtime.replaceMessages([
      userMessage(`old-${'x'.repeat(1000)}`),
      toolResultMessage('missing-call', 'read', 'orphaned output'),
      userMessage('latest valid message'),
    ])

    const result = await runtime.compact({ persistToSession: false })

    expect(result.messages.some((message) => message.role === 'toolResult')).toBe(false)
    expect(summarizedMessages.some((message) =>
      message.role === 'user' &&
      typeof message.content === 'string' &&
      message.content.includes('Malformed tool interaction')
    )).toBe(true)
  })

  test('automatic compaction uses the same commit and persistence path', async () => {
    const persistence = new MemoryPersistence()
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'automatic-compaction' },
      persistence,
      generateSummaryFn: fakeGenerateSummary,
      compactionSettings: {
        enabled: true,
        reserveTokens: 999_999,
      },
    })
    const messages = [
      userMessage('automatic context that crosses the configured threshold'),
      assistantMessage('automatic-usage', 9),
    ]
    runtime.replaceMessages(messages, 'rebuild')

    const transformed = await runtime.compactIfNeeded(messages)

    expect(transformed).toEqual([...runtime.getMessages()])
    expect(transformed.length).toBeGreaterThan(0)
    expect(persistence.records).toHaveLength(1)
    expect(persistence.records[0].automatic).toBe(true)
    expect(runtime.getTokenStats().session.inputTokens).toBe(9)

    const secondTransform = await runtime.compactIfNeeded(runtime.getMessages())
    expect(secondTransform).toEqual([...runtime.getMessages()])
    expect(persistence.records).toHaveLength(2)
    expect(persistence.records[1]?.automatic).toBe(true)
  })

  test('can compact without writing to persistence', async () => {
    const persistence = new MemoryPersistence()
    const runtime = createMicrocodeAgentRuntime({
      identity: { id: 'non-persistent-compaction' },
      persistence,
      generateSummaryFn: fakeGenerateSummary,
    })
    runtime.replaceMessages([
      userMessage('first'),
      userMessage('second'),
      userMessage('third'),
    ])

    await runtime.compact({ persistToSession: false })

    expect(persistence.saved).toEqual([])
    expect(persistence.records).toEqual([])
    expect(runtime.getMessages()[0].role).toBe('user')
  })

  test('keeps compaction state isolated between agent instances', async () => {
    const primary = createMicrocodeAgentRuntime({
      identity: { id: 'compact-primary' },
      generateSummaryFn: fakeGenerateSummary,
    })
    const worker = createMicrocodeAgentRuntime({
      identity: { id: 'compact-worker', parentId: 'compact-primary' },
      generateSummaryFn: fakeGenerateSummary,
    })
    const primaryMessages = [
      userMessage('primary first'),
      userMessage('primary second'),
      userMessage('primary third'),
    ]
    const workerMessages = [
      userMessage('worker first'),
      assistantMessage('worker-usage', 11),
    ]
    primary.replaceMessages(primaryMessages, 'rebuild')
    worker.replaceMessages(workerMessages, 'rebuild')

    await primary.compact({ persistToSession: false })

    expect(primary.getMessages()).not.toEqual(primaryMessages)
    expect(worker.getMessages()).toEqual(workerMessages)
    expect(worker.getTokenStats().session.inputTokens).toBe(11)
  })
})
