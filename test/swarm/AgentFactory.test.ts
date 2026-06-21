import { beforeAll, describe, expect, test } from 'bun:test'
import { createMicrocodeAgentRuntime } from '../../src/agent/index.ts'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import { createWorkerAgent } from '../../src/swarm/index.ts'

beforeAll(() => ensureBootstrapMacro())

describe('AgentFactory permissions', () => {
  test('does not allow a child mode to exceed its parent', () => {
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
        workKind: 'write',
        permissionMode: 'auto-approve',
      },
    })
    expect(worker.getPermissionMode()).toBe('interactive')
    expect(worker.checkPermission('bash', { command: 'echo unsafe' })).toEqual({
      allowed: false,
      reason: 'Tool "bash" denied by rule: bash',
    })
    expect(worker.hasTool('spawn_agent')).toBe(false)
    expect(worker.hasTool('task')).toBe(false)
  })

  test('forces read workers into plan mode', () => {
    const parent = createMicrocodeAgentRuntime({
      identity: { id: 'parent-auto' },
      permission: { mode: 'auto-approve' },
    })
    const worker = createWorkerAgent({
      parent,
      agentId: 'reader',
      request: {
        parentAgentId: parent.getId(),
        description: 'Read',
        prompt: 'Inspect files',
        workKind: 'read',
      },
    })
    expect(worker.getPermissionMode()).toBe('plan')
    expect(worker.checkPermission('file_edit', { path: 'x' }).allowed).toBe(false)
  })
})
