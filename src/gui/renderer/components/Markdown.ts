import React, { useMemo } from 'react'
import { marked } from 'marked'
import markedKatex from 'marked-katex-extension'
import { escapeHtml, highlightCodeHtml } from '../lib/syntaxHighlight.ts'

const renderer = new marked.Renderer()

marked.use(markedKatex({
  nonStandard: true,
  throwOnError: false,
}))

renderer.code = ({ text, lang }) => {
  const language = (lang ?? '').trim().split(/\s+/)[0] ?? ''
  const className = language ? ` class="language-${escapeHtml(language)}"` : ''
  const label = language || 'code'
  return [
    '<div class="markdown-code-block">',
    '<div class="markdown-code-head">',
    `<span>${escapeHtml(label)}</span>`,
    '<button type="button" class="markdown-copy-button">Copy</button>',
    '</div>',
    `<pre><code${className}>${highlightCodeHtml(text, language)}</code></pre>`,
    '</div>',
  ].join('')
}

renderer.link = ({ href, title, tokens }) => {
  const label = renderer.parser.parseInline(tokens)
  const titleAttr = title ? ` title="${escapeHtml(title)}"` : ''
  return `<a href="${escapeHtml(href)}"${titleAttr} target="_blank" rel="noopener noreferrer">${label}</a>`
}

export function renderMarkdownHtml(text: string): string {
  return marked.parse(text, { async: false, gfm: true, renderer }) as string
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }

  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.setAttribute('readonly', 'true')
  textarea.style.position = 'fixed'
  textarea.style.left = '-9999px'
  document.body.appendChild(textarea)
  textarea.select()
  const ok = document.execCommand('copy')
  textarea.remove()
  if (!ok) throw new Error('Copy failed')
}

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdownHtml(text), [text])
  const handleClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const link = (event.target as HTMLElement).closest('a[href]') as HTMLAnchorElement | null
    if (link?.href) {
      event.preventDefault()
      void window.microcode.openExternal(link.href)
      return
    }

    const button = (event.target as HTMLElement).closest('.markdown-copy-button') as HTMLButtonElement | null
    if (!button) return
    const block = button.closest('.markdown-code-block')
    const code = block?.querySelector('code')?.textContent ?? ''
    if (!code) return

    void copyText(code).then(() => {
      button.textContent = 'Copied'
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = 'Copy'
      }, 1200)
    }).catch(() => {
      button.textContent = 'Failed'
      window.setTimeout(() => {
        if (button.isConnected) button.textContent = 'Copy'
      }, 1200)
    })
  }

  return React.createElement('div', {
    className: 'markdown',
    onClick: handleClick,
    dangerouslySetInnerHTML: { __html: html },
  })
}
