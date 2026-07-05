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

  test('renders inline and block markdown math', () => {
    const html = renderMarkdownHtml('Inline $E=mc^2$.\n\n$$\n\\frac{a_1}{\\sqrt{b}} = \\alpha\n$$')
    expect(html).toContain('class="katex"')
    expect(html).toContain('class="katex-display"')
    expect(html).toContain('mfrac')
    expect(html).toContain('sqrt')
    expect(html).toContain('α')
  })

  test('does not render math delimiters inside code', () => {
    const html = renderMarkdownHtml('`$x$`\n\n```txt\n$$\nnot math\n$$\n```')
    expect(html).toContain('<code>$x$</code>')
    expect(html).toContain('markdown-code-block')
    expect(html).not.toContain('class="katex"')
  })

  test('renders markdown links as external links', () => {
    const html = renderMarkdownHtml('[Microcode](https://example.com "site")')
    expect(html).toContain('<a href="https://example.com"')
    expect(html).toContain('title="site"')
    expect(html).toContain('target="_blank"')
    expect(html).toContain('rel="noopener noreferrer"')
  })
})
