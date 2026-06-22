import { describe, expect, test } from 'bun:test'
import { AgentResult } from '../../src/tui/components/agentResult.ts'

const ANSI_RE = /\x1b\[[0-9;]*m/g

function plain(lines: string[]): string {
  return lines.join('\n').replace(ANSI_RE, '').replace(/[ \t]+$/gm, '')
}

describe('AgentResult', () => {
  test('renders markdown tables, emphasis, and fenced code', () => {
    const result = new AgentResult([
      'Here are the results:',
      '',
      '| Tool | Version |',
      '|---|---|',
      '| **node** | `v22.14.0` |',
      '',
      '```sh',
      'node --version',
      '```',
    ].join('\n'), false)

    const output = plain(result.render(60))

    expect(output).toContain('└─ Result')
    expect(output).toContain('┌')
    expect(output).toContain('│ Tool')
    expect(output).toContain('│ node')
    expect(output).toContain('node --version')
    expect(output).not.toContain('|---|---|')
    expect(output).not.toContain('```')
    expect(output).not.toContain('**node**')
  })

  test('keeps the source-line preview limit', () => {
    const result = new AgentResult(
      Array.from({ length: 35 }, (_, index) => `line ${index + 1}`).join('\n'),
      true,
    )

    const output = plain(result.render(60))

    expect(output).toContain('├─ Result')
    expect(output).toContain('line 30')
    expect(output).not.toContain('line 31')
    expect(output).toContain('…and 5 more lines')
  })
})
