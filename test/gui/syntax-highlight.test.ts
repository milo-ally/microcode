import { describe, expect, test } from 'bun:test'
import { renderMarkdownHtml } from '../../src/gui/renderer/components/Markdown.ts'
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

  test('renders gfm tables and copyable code block chrome', () => {
    const html = renderMarkdownHtml('| 属性 | 值 |\n| --- | --- |\n| Maven | `org.example:demo` |\n\n```ts\nconst x = 1\n```')
    expect(html).toContain('<table>')
    expect(html).toContain('<th>属性</th>')
    expect(html).toContain('markdown-code-block')
    expect(html).toContain('markdown-copy-button')
    expect(html).toContain('Copy')
  })
})
