import { describe, expect, test } from 'bun:test'
import {
  createCodingTools,
} from '../../src/tools/index.ts'
import {
  formatToolSummary,
  getAllToolDefinitions,
} from '../../src/tools/registry.ts'

describe('tool summaries', () => {
  test('registered tools provide explicit cross-agent summaries', () => {
    createCodingTools({
      cwd: process.cwd(),
      getSkills: () => [],
      modelSupportsImages: true,
    })

    const missing = getAllToolDefinitions()
      .filter((definition) => !definition.shouldDefer)
      .filter((definition) => !definition.display?.summary)
      .map((definition) => definition.name)

    expect(missing).toEqual([])
  })

  test('default summaries never include raw tool output', () => {
    const raw = 'sensitive output '.repeat(1000)
    const summary = formatToolSummary('mcp__demo__dump', {
      content: [{ type: 'text', text: raw }],
      isError: false,
    })

    expect(summary).toContain('demo/dump')
    expect(summary).toContain('completed')
    expect(summary).toContain('produced')
    expect(summary).not.toContain(raw.slice(0, 100))
  })
})
