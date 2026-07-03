import { describe, expect, test } from 'bun:test'
import { highlightCodeHtml, highlightLineSegments } from '../../src/gui/renderer/lib/syntaxHighlight.ts'

describe('GUI syntax highlighting', () => {
  test('highlights common language tokens for inline code previews', () => {
    const segments = highlightLineSegments('const answer = "yes" // ok', 'ts')
    expect(segments.some((segment) => segment.text === 'const' && segment.className === 'syntax-keyword')).toBe(true)
    expect(segments.some((segment) => segment.text === '"yes"' && segment.className === 'syntax-string')).toBe(true)
    expect(segments.some((segment) => segment.text === '// ok' && segment.className === 'syntax-comment')).toBe(true)
  })

  test('escapes and highlights markdown code block html', () => {
    const html = highlightCodeHtml('{"name":"<microcode>"}', 'json')
    expect(html).toContain('syntax-property')
    expect(html).toContain('&lt;microcode&gt;')
  })
})
