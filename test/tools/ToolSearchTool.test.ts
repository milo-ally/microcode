import { describe, expect, test } from 'bun:test'
import type { AgentTool } from '@earendil-works/pi-agent-core'
import { createToolSearchTool } from '../../src/tools/ToolSearchTool/ToolSearchTool.ts'
import type { ToolDefinition } from '../../src/tools/registry.ts'

describe('ToolSearchTool', () => {
  test('uses a cached schema without creating a probe tool', async () => {
    let createCalls = 0
    const definition: ToolDefinition = {
      name: 'mcp__demo__cached',
      defaultPermission: 'allow',
      description: 'Cached MCP tool',
      schema: '{"type":"object","properties":{"query":{"type":"string"}}}',
      shouldDefer: true,
      createTool: () => {
        createCalls++
        throw new Error('must not connect')
      },
    }
    const discovered: string[][] = []
    const tool = createToolSearchTool({
      getDeferredTools: () => [definition],
      onToolsDiscovered: (names) => discovered.push(names),
    })

    const result = await tool.execute('search', {
      query: 'select:mcp__demo__cached',
    })

    expect(createCalls).toBe(0)
    expect(result.content[0]?.text).toContain(definition.schema!)
    expect(discovered).toEqual([['mcp__demo__cached']])
  })

  test('deduplicates discovery callbacks per tool for 30 seconds', async () => {
    const definition: ToolDefinition = {
      name: 'DeferredExample',
      defaultPermission: 'allow',
      shouldDefer: true,
      createTool: () => ({
        name: 'DeferredExample',
        label: 'Deferred example',
        description: 'Example',
        parameters: {},
        execute: async () => ({ content: [] }),
      } as AgentTool),
    }
    const discovered: string[][] = []
    const tool = createToolSearchTool({
      getDeferredTools: () => [definition],
      onToolsDiscovered: (names) => discovered.push(names),
    })

    await tool.execute('first', { query: 'select:DeferredExample' })
    await tool.execute('second', { query: 'select:DeferredExample' })

    expect(discovered).toEqual([['DeferredExample']])
  })
})
