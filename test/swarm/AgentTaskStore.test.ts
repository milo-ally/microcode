import { describe, expect, test } from 'bun:test'
import { AgentTaskStore } from '../../src/swarm/index.ts'

describe('AgentTaskStore', () => {
  test('creates immutable copies and updates usage', () => {
    const store = new AgentTaskStore()
    const task = store.create({
      parentAgentId: 'parent',
      description: 'Inspect auth',
      prompt: 'Inspect auth files',
      workKind: 'read',
    }, {
      taskId: 'task-1',
      agentId: 'agent-1',
    })
    store.update(task.id, {
      status: 'running',
      usage: { tokens: 10, toolCalls: 2 },
    })
    expect(store.get(task.id)).toMatchObject({
      status: 'running',
      usage: { tokens: 10, toolCalls: 2 },
    })
    ;(task.usage as { tokens: number }).tokens = 999
    expect(store.get(task.id)?.usage.tokens).toBe(10)
  })

  test('restores unfinished tasks as interrupted', () => {
    const store = new AgentTaskStore()
    store.restore([{
      id: 'task-1',
      agentId: 'agent-1',
      parentAgentId: 'parent',
      description: 'Running work',
      prompt: 'work',
      role: 'worker',
      workKind: 'write',
      status: 'running',
      createdAt: 1,
      usage: { tokens: 0, toolCalls: 0 },
    }])
    expect(store.get('task-1')).toMatchObject({
      status: 'interrupted',
      error: 'Interrupted when the previous session ended.',
    })
  })
})
