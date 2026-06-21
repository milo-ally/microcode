import { beforeAll, describe, expect, test } from 'bun:test'
import { createMicrocodeAgentRuntime } from '../../src/agent/index.ts'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import { AgentRegistry } from '../../src/swarm/index.ts'

beforeAll(() => ensureBootstrapMacro())

describe('AgentRegistry', () => {
  test('registers, lists, and removes agents', () => {
    const registry = new AgentRegistry()
    const agent = createMicrocodeAgentRuntime({
      identity: { id: 'agent-one' },
    })
    registry.register(agent)
    expect(registry.get('agent-one')).toBe(agent)
    expect(registry.list()).toEqual([agent])
    expect(registry.remove('agent-one')).toBe(true)
    expect(registry.get('agent-one')).toBeUndefined()
  })

  test('rejects duplicate IDs', () => {
    const registry = new AgentRegistry()
    registry.register(createMicrocodeAgentRuntime({
      identity: { id: 'duplicate' },
    }))
    expect(() => registry.register(createMicrocodeAgentRuntime({
      identity: { id: 'duplicate' },
    }))).toThrow('Agent already registered')
  })
})
