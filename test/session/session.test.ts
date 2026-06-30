import { describe, expect, test } from 'bun:test'
import { estimateMessagesTokens, estimateTokens } from '../../src/session/TokenEstimator.ts'
import { replaceImageBlocksForPersistence } from '../../src/session/imageSerializer.ts'

describe('session modules', () => {
  test('estimates text, thinking, tool call, image, and summary messages', () => {
    const user = { role: 'user', content: '12345678', timestamp: 0 } as any
    const assistant = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'abcd' },
        { type: 'thinking', thinking: 'efgh' },
        { type: 'toolCall', name: 'tool', arguments: { a: 1 } },
      ],
      timestamp: 0,
    } as any
    const image = {
      role: 'toolResult',
      content: [{ type: 'image', data: 'x', mimeType: 'image/png' }],
      timestamp: 0,
    } as any
    const summary = { role: 'compactionSummary', summary: '1234', timestamp: 0 } as any

    expect(estimateTokens(user)).toBe(2)
    expect(estimateTokens(assistant)).toBeGreaterThan(2)
    expect(estimateTokens(image)).toBe(2000)
    expect(estimateTokens(summary)).toBe(1)
    expect(estimateMessagesTokens([user, summary])).toBe(3)
  })

  test('estimates every message role and block variant', () => {
    expect(estimateTokens({ role: 'user', content: [{ type: 'text', text: 'abcd' }, { type: 'image', data: 'x' }], timestamp: 0 } as any)).toBe(2001)
    expect(estimateTokens({ role: 'toolResult', content: [{ type: 'text', text: 'abcd' }], timestamp: 0 } as any)).toBe(1)
    expect(estimateTokens({ role: 'bashExecution', command: 'echo hi', output: 'hello', timestamp: 0 } as any)).toBe(3)
    expect(estimateTokens({ role: 'branchSummary', summary: 'abcd', timestamp: 0 } as any)).toBe(1)
    expect(estimateTokens({ role: 'custom', content: 'abcd', timestamp: 0 } as any)).toBe(1)
    expect(estimateTokens({ role: 'custom', content: [{ type: 'text', text: 'abcd' }], timestamp: 0 } as any)).toBe(1)
  })

  test('replaces persisted image blocks without mutating non-image messages', () => {
    const msg = {
      role: 'user',
      content: [
        { type: 'text', text: 'see' },
        { type: 'image', data: 'base64', mimeType: 'image/png' },
      ],
      timestamp: 0,
    } as any
    const persisted = replaceImageBlocksForPersistence(msg) as any

    expect(persisted).not.toBe(msg)
    expect(persisted.content).toEqual([
      { type: 'text', text: 'see' },
      { type: 'text', text: '[Image: image/png]' },
    ])
    expect(replaceImageBlocksForPersistence({ role: 'assistant', content: [], timestamp: 0 } as any).role).toBe('assistant')
  })
})
