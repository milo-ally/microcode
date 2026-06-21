import { describe, expect, test } from 'bun:test'
import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { Api, AssistantMessage, Model } from '@earendil-works/pi-ai'
import { AgentTokenTracker } from '../../src/agent/AgentTokenTracker.ts'

const MODEL: Model<Api> = {
  id: 'model-a',
  name: 'Model A',
  api: 'openai-completions',
  provider: 'provider-a',
  baseUrl: 'https://example.com',
  reasoning: false,
  input: ['text'],
  cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0.2 },
  contextWindow: 1000,
  maxTokens: 100,
}

function assistantMessage(options: {
  responseId: string
  model?: string
  provider?: string
  api?: Api
  input?: number
  output?: number
  cacheRead?: number
  cacheWrite?: number
  cost?: number
}): AssistantMessage {
  const input = options.input ?? 10
  const output = options.output ?? 5
  const cacheRead = options.cacheRead ?? 2
  const cacheWrite = options.cacheWrite ?? 1
  return {
    role: 'assistant',
    content: [{ type: 'text', text: 'response' }],
    api: options.api ?? 'openai-completions',
    provider: options.provider ?? 'provider-a',
    model: options.model ?? 'model-a',
    responseId: options.responseId,
    usage: {
      input,
      output,
      cacheRead,
      cacheWrite,
      totalTokens: input + output + cacheRead + cacheWrite,
      cost: {
        input: 0.01,
        output: 0.02,
        cacheRead: 0.001,
        cacheWrite: 0.002,
        total: options.cost ?? 0.033,
      },
    },
    stopReason: 'stop',
    timestamp: Date.now(),
  }
}

function userMessage(text: string): AgentMessage {
  return { role: 'user', content: text, timestamp: Date.now() }
}

describe('AgentTokenTracker', () => {
  test('separates current context estimates from provider usage', () => {
    const tracker = new AgentTokenTracker()
    const messages = [
      userMessage('12345678'),
      assistantMessage({ responseId: 'response-1' }),
    ]
    const snapshot = tracker.getSnapshot({
      systemPrompt: '12345678',
      messages,
      model: MODEL,
    })

    expect(snapshot.context.systemPromptTokens).toBe(2)
    expect(snapshot.context.messageTokens).toBeGreaterThan(2)
    expect(snapshot.context.usedTokens).toBe(
      snapshot.context.systemPromptTokens + snapshot.context.messageTokens,
    )
    expect(snapshot.session.requests).toBe(1)
    expect(snapshot.session.inputTokens).toBe(10)
    expect(snapshot.session.outputTokens).toBe(5)
    expect(snapshot.session.totalCost).toBe(0.033)
  })

  test('deduplicates requests and groups usage by provider, API, and model', () => {
    const tracker = new AgentTokenTracker()
    const first = assistantMessage({ responseId: 'response-1' })
    const second = assistantMessage({
      responseId: 'response-2',
      model: 'model-b',
      provider: 'provider-b',
      api: 'anthropic-messages',
      input: 20,
      output: 8,
      cost: 0.08,
    })

    tracker.recordMessages([first, first, second])
    const snapshot = tracker.getSnapshot({
      systemPrompt: '',
      messages: [first, second],
      model: MODEL,
    })

    expect(snapshot.session.requests).toBe(2)
    expect(snapshot.session.inputTokens).toBe(30)
    expect(Object.keys(snapshot.byModel)).toEqual([
      'provider-a:openai-completions:model-a',
      'provider-b:anthropic-messages:model-b',
    ])
    expect(snapshot.currentModel.requests).toBe(1)
    expect(snapshot.byModel['provider-b:anthropic-messages:model-b'].totalCost).toBe(0.08)

    const switchedModelSnapshot = tracker.getSnapshot({
      systemPrompt: '',
      messages: [first, second],
      model: {
        ...MODEL,
        id: 'model-b',
        name: 'Model B',
        provider: 'provider-b',
        api: 'anthropic-messages',
      },
    })
    expect(switchedModelSnapshot.currentModel.modelId).toBe('model-b')
    expect(switchedModelSnapshot.currentModel.requests).toBe(1)
  })

  test('rebuilds usage when a different session is restored', () => {
    const tracker = new AgentTokenTracker()
    tracker.rebuild([assistantMessage({ responseId: 'old-session', input: 50 })])
    tracker.rebuild([assistantMessage({ responseId: 'new-session', input: 7 })])

    const snapshot = tracker.getSnapshot({
      systemPrompt: '',
      messages: [],
      model: MODEL,
    })
    expect(snapshot.session.requests).toBe(1)
    expect(snapshot.session.inputTokens).toBe(7)
  })

  test('preserves historical usage while compacted context becomes smaller', () => {
    const tracker = new AgentTokenTracker()
    const historical = assistantMessage({ responseId: 'historical', input: 100 })
    const beforeMessages = [
      userMessage('x'.repeat(400)),
      historical,
    ]
    const before = tracker.getSnapshot({
      systemPrompt: 'system',
      messages: beforeMessages,
      model: MODEL,
    })

    const compactedMessages = [userMessage('short summary')]
    tracker.recordMessages(compactedMessages)
    const after = tracker.getSnapshot({
      systemPrompt: 'system',
      messages: compactedMessages,
      model: MODEL,
    })

    expect(after.context.usedTokens).toBeLessThan(before.context.usedTokens)
    expect(after.session.requests).toBe(1)
    expect(after.session.inputTokens).toBe(100)
  })
})
