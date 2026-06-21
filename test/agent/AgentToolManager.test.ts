import { beforeAll, describe, expect, test } from 'bun:test'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { Type } from 'typebox'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import { AgentToolManager } from '../../src/agent/AgentToolManager.ts'
import { resolveAgentModelConfig } from '../../src/agent/AgentModelManager.ts'

beforeAll(() => {
  ensureBootstrapMacro()
})

function tool(name: string, label: string): AgentTool<any, any> {
  return {
    name,
    label,
    description: label,
    parameters: Type.Object({}),
    async execute() {
      return { content: [{ type: 'text', text: label }], details: {} }
    },
  }
}

function fakeMcpClient(toolName: string) {
  return {
    getAllTools: () => [{
      name: toolName,
      serverName: 'test-server',
      description: 'Test MCP tool',
      inputSchema: { type: 'object', properties: {} },
    }],
    getAllResources: () => [],
    callTool: async () => ({ content: [{ type: 'text', text: 'ok' }] }),
    readResource: async () => ({ contents: [] }),
  } as any
}

describe('AgentToolManager', () => {
  test('deduplicates external tools by name and replaces the old instance', () => {
    const manager = new AgentToolManager({
      cwd: process.cwd(),
      getSkills: () => [],
      model: resolveAgentModelConfig('deepseek-v4-pro', 'openai-completions').model,
    })
    manager.addTools([tool('external', 'first')])
    manager.addTools([tool('external', 'second')])

    expect(manager.getTools().filter((item) => item.name === 'external')).toHaveLength(1)
    expect(manager.findTool('external')?.label).toBe('second')
    expect(manager.getSnapshot().external).toEqual(['external'])
    expect(manager.getSnapshot().core).toContain('task')
  })

  test('removes tools from the managed collections', () => {
    const manager = new AgentToolManager({
      cwd: process.cwd(),
      getSkills: () => [],
      model: resolveAgentModelConfig('deepseek-v4-pro', 'openai-completions').model,
    })
    manager.addTools([tool('temporary', 'temporary')])
    manager.removeTools(['temporary'])

    expect(manager.findTool('temporary')).toBeUndefined()
    expect(manager.getSnapshot().names).not.toContain('temporary')
  })

  test('rebuilds model-dependent core tools while preserving external tools', () => {
    const manager = new AgentToolManager({
      cwd: process.cwd(),
      getSkills: () => [],
      model: resolveAgentModelConfig('deepseek-v4-pro', 'openai-completions').model,
    })
    manager.addTools([tool('external', 'external')])
    expect(manager.getSnapshot().core).not.toContain('vision')

    manager.rebuildCoreTools(
      resolveAgentModelConfig('mimo-v2.5', 'openai-completions').model,
    )

    expect(manager.getSnapshot().core).toContain('vision')
    expect(manager.getSnapshot().external).toContain('external')
    expect(manager.findTool('external')).toBeDefined()
  })

  test('queues and commits deferred tools discovered through ToolSearch', async () => {
    const manager = new AgentToolManager({
      cwd: process.cwd(),
      getSkills: () => [],
      model: resolveAgentModelConfig('deepseek-v4-pro', 'openai-completions').model,
    })
    manager.configureMcpTools(fakeMcpClient('deferred_action'))
    const search = manager.findTool('search')
    expect(search).toBeDefined()

    await search!.execute('search-call', {
      query: 'select:mcp__test-server__deferred_action',
    })
    expect(manager.findTool('mcp__test-server__deferred_action')).toBeUndefined()
    const discovered = manager.commitPendingDiscoveredTools()
    expect(discovered.map((item) => item.name)).toEqual([
      'mcp__test-server__deferred_action',
    ])
    expect(manager.getSnapshot().discovered).toContain(
      'mcp__test-server__deferred_action',
    )
    expect(manager.commitPendingDiscoveredTools()).toEqual([])
  })

  test('keeps MCP deferred definitions scoped to one manager', async () => {
    const primary = new AgentToolManager({
      cwd: process.cwd(),
      getSkills: () => [],
      model: resolveAgentModelConfig('deepseek-v4-pro', 'openai-completions').model,
    })
    const worker = new AgentToolManager({
      cwd: process.cwd(),
      getSkills: () => [],
      model: resolveAgentModelConfig('deepseek-v4-pro', 'openai-completions').model,
    })
    primary.configureMcpTools(fakeMcpClient('private_action'))

    const workerSearch = worker.findTool('search')!
    const result = await workerSearch.execute('search-call', {
      query: 'select:mcp__test-server__private_action',
    })

    expect((result.details as any).matches).toEqual([])
    expect(worker.commitPendingDiscoveredTools()).toEqual([])
  })
})
