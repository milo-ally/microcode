import { describe, expect, test } from 'bun:test'
import { AgentRegistry } from '../../src/swarm/AgentRegistry.ts'
import { AgentTaskStore } from '../../src/swarm/AgentTaskStore.ts'

describe('swarm modules', () => {
  test('agent registry stores unique agents and removes by id', () => {
    const registry = new AgentRegistry()
    const agent = { getId: () => 'agent-1' } as any
    registry.register(agent)

    expect(registry.get('agent-1')).toBe(agent)
    expect(() => registry.register(agent)).toThrow('Agent already registered')
    expect(registry.list()).toEqual([agent])
    expect(registry.remove('agent-1')).toBe(true)
  })

  test('agent task store clones data, restores running work as interrupted, and evicts old terminal tasks', () => {
    const store = new AgentTaskStore({ maxHistory: 2 })
    const request = { parentAgentId: 'parent', description: 'Do it', prompt: 'Prompt' } as any
    const first = store.create(request, { taskId: 'task-1', agentId: 'agent-1' }, 'batch-1')
    store.setStatus(first.id, 'completed')
    store.create(request, { taskId: 'task-2', agentId: 'agent-2' }, 'batch-2')
    store.create(request, { taskId: 'task-3', agentId: 'agent-3' }, 'batch-3')

    expect(store.get('task-1')).toBeUndefined()
    const task2 = store.update('task-2', { usage: { tokens: 10 }, blockers: [{ reason: 'wait' } as any] })
    ;(task2.blockers as any[]).push({ reason: 'mutated' })
    expect(store.get('task-2')?.blockers).toHaveLength(1)

    store.restore([{ ...store.get('task-2')!, status: 'running' as const } as any])
    expect(store.get('task-2')?.status).toBe('interrupted')
  })
})
