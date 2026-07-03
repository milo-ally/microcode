import React from 'react'
import { FileUp } from 'lucide-react'
import { formatBytes, getDetailNumber, getDetailString, MetricRow, shortPath, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'
import { highlightLineSegments } from '../../../lib/syntaxHighlight.ts'

const INLINE_PREVIEW_LINES = 10
const EXPANDED_PREVIEW_LINES = 80

function languageFromPath(path: string): string {
  return path.split('.').pop() ?? ''
}

function renderHighlightedLine(line: string, language: string): React.ReactNode[] {
  return highlightLineSegments(line, language).map((segment, index) =>
    React.createElement('span', {
      key: `${index}-${segment.text}`,
      className: segment.className,
    }, segment.text),
  )
}

function inlineCodePreview(content: string, expanded: boolean, language: string): React.ReactNode {
  const lines = content.split('\n')
  const limit = expanded ? EXPANDED_PREVIEW_LINES : INLINE_PREVIEW_LINES
  const shown = lines.slice(0, limit)
  const truncated = lines.length > shown.length
  const gutterWidth = String(Math.max(1, shown.length)).length

  return React.createElement('div', { className: 'tool-code-preview' },
    React.createElement('div', { className: 'tool-code-preview-head' },
      React.createElement('span', null, 'Content'),
      React.createElement('span', null, `${lines.length.toLocaleString()} lines`),
    ),
    React.createElement('pre', { className: 'tool-code-frame' },
      shown.map((line, index) =>
        React.createElement('div', { className: 'tool-code-line', key: `${index}-${line}` },
          React.createElement('span', { className: 'tool-code-gutter' }, String(index + 1).padStart(gutterWidth, ' ')),
          React.createElement('span', { className: 'tool-code-text' }, line ? renderHighlightedLine(line, language) : ' '),
        ),
      ),
      truncated && React.createElement('div', { className: 'tool-code-omitted', key: 'omitted' },
        `... ${lines.length - shown.length} more lines`,
      ),
    ),
  )
}

export function FileWriteToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const previewText = getDetailString(item.details, 'preview') ?? (typeof item.args.content === 'string' ? item.args.content : '')
  const warning = getDetailString(item.details, 'warning')
  const additions = getDetailNumber(item.details, 'additions')
  const removals = getDetailNumber(item.details, 'removals')
  const phase = getDetailString(item.details, 'phase')
  const byteText = formatBytes(item.details?.bytesWritten)
  const language = languageFromPath(path)
  const summary = [
    phase === 'preparing' ? 'preparing' : phase === 'writing' ? 'writing' : undefined,
    additions !== undefined ? `+${additions}` : undefined,
    removals !== undefined ? `-${removals}` : undefined,
    byteText,
  ].filter(Boolean).join(' · ')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FileUp, { size: 16 }),
    title: 'write',
    subtitle: [shortPath(path) || 'file', summary].filter(Boolean).join('  '),
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        item.details?.isNewFile === true ? 'new file' : undefined,
        additions !== undefined ? `+${additions}` : undefined,
        removals !== undefined ? `-${removals}` : undefined,
        byteText,
        item.details?.written === false ? 'not written' : undefined,
        phase,
      ],
    }),
    warning && React.createElement('div', { className: 'tool-warning' }, warning),
    previewText && inlineCodePreview(previewText, expanded, language),
  )
}
