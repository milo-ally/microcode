import React, { useMemo } from 'react'
import { marked } from 'marked'
import { escapeHtml, highlightCodeHtml } from '../lib/syntaxHighlight.ts'

const renderer = new marked.Renderer()

renderer.code = ({ text, lang }) => {
  const language = (lang ?? '').trim().split(/\s+/)[0] ?? ''
  const className = language ? ` class="language-${escapeHtml(language)}"` : ''
  return `<pre><code${className}>${highlightCodeHtml(text, language)}</code></pre>`
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text, { async: false, renderer }) as string, [text])
  return React.createElement('div', {
    className: 'markdown',
    dangerouslySetInnerHTML: { __html: html },
  })
}
