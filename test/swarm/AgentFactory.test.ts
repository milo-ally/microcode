import { beforeAll, describe, expect, test } from 'bun:test'
import { createMicrocodeAgentRuntime } from '../../src/agent/index.ts'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import { createWorkerAgent } from '../../src/swarm/index.ts'

beforeAll(() => ensureBootstrapMacro())

describe('AgentFactory permissions', () => {
  test('worker is always auto-approve', () => {
    const parent = createMicrocodeAgentRuntime({
      identity: { id: 'parent' },
      permission: {
        mode: 'interactive',
        deny: ['bash'],
      },
    })
    const worker = createWorkerAgent({
      parent,
      agentId: 'worker',
      request: {
        parentAgentId: parent.getId(),
        description: 'Implement',
        prompt: 'Implement the change',
       
      },
    })
    expect(worker.getPermissionMode()).toBe('auto-approve')
    // Deny rules from parent are inherited.
    expect(worker.checkPermission('bash', { command: 'echo unsafe' })).toEqual({
      allowed: false,
      reason: 'Tool "bash" denied by rule: bash',
    })
    // Tools not in the allowed set are removed.
    expect(worker.hasTool('spawn_agent')).toBe(false)
    expect(worker.hasTool('task')).toBe(false)
  })

  test('workers get read and write tools by default', () => {
    const parent = createMicrocodeAgentRuntime({
      identity: { id: 'parent' },
      permission: { mode: 'auto-approve' },
    })
    const worker = createWorkerAgent({
      parent,
      agentId: 'reader',
      request: {
        parentAgentId: parent.getId(),
        description: 'Read',
        prompt: 'Inspect files',
       
      },
    })
    expect(worker.getPermissionMode()).toBe('auto-approve')
    expect(worker.hasTool('read')).toBe(true)
    expect(worker.hasTool('grep')).toBe(true)
    expect(worker.hasTool('bash')).toBe(true)
    expect(worker.hasTool('edit')).toBe(true)
    expect(worker.hasTool('write')).toBe(true)
  })

  test('write workers get read + write tools', () => {
    const parent = createMicrocodeAgentRuntime({
      identity: { id: 'parent' },
      permission: { mode: 'plan' },
    })
    const worker = createWorkerAgent({
      parent,
      agentId: 'writer',
      request: {
        parentAgentId: parent.getId(),
        description: 'Write',
        prompt: 'Edit files',
        tools: ['read', 'grep', 'glob', 'edit', 'write'],
      },
    })
    expect(worker.getPermissionMode()).toBe('auto-approve')
    expect(worker.hasTool('read')).toBe(true)
    expect(worker.hasTool('edit')).toBe(true)
    expect(worker.hasTool('write')).toBe(true)
  })
})
