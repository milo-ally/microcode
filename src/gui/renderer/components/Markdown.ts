import React, { useMemo } from 'react'
import { marked } from 'marked'

export function Markdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text])
  return React.createElement('div', {
    className: 'markdown',
    dangerouslySetInnerHTML: { __html: html },
  })
}
