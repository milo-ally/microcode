import { beforeAll, describe, expect, test } from 'bun:test'
import { ensureBootstrapMacro } from '../../src/macro.ts'
import { getSystemPrompt } from '../../src/prompt/prompts.ts'
import type { McpServerState } from '../../src/mcp/types.ts'

beforeAll(() => {
  ensureBootstrapMacro()
})

describe('system prompt MCP guidance', () => {
  test('keeps MCP schemas deferred while instructing exact search selection', () => {
    const mcpServers: McpServerState[] = [{
      name: 'chrome-devtools',
      config: { command: 'chrome-devtools' },
      status: 'connected',
      tools: [{
        name: 'evaluate_script',
        serverName: 'chrome-devtools',
        description: 'Runs JavaScript in the browser',
        inputSchema: {
          type: 'object',
          required: ['function', 'filePath'],
          properties: {
            function: { type: 'string' },
            filePath: { type: 'string' },
          },
        },
      }],
      resources: [],
    }]

    const prompt = getSystemPrompt({
      cwd: process.cwd(),
      modelId: 'test-model',
      mcpServers,
      deferredToolNames: ['mcp__chrome-devtools__evaluate_script'],
    }).join('\n')

    expect(prompt).toContain('mcp__chrome-devtools__evaluate_script')
    expect(prompt).toContain('select:<exact_tool_name>')
    expect(prompt).not.toContain('"required"')
    expect(prompt).not.toContain('"filePath"')
  })
})
