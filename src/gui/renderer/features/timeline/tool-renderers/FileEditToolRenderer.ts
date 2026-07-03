import React from 'react'
import { FilePenLine } from 'lucide-react'
import { diffLines } from 'diff'
import { getDetailNumber, getDetailString, MetricRow, OutputBlock, preview, shortPath, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'
import { highlightLineSegments } from '../../../lib/syntaxHighlight.ts'

function languageFromPath(path: string): string {
  return path.split('.').pop() ?? ''
}

function renderHighlightedDiffText(text: string, language: string): React.ReactNode[] {
  const prefix = text.slice(0, 1)
  const code = text.slice(1)
  return [
    React.createElement('span', { className: 'tool-diff-prefix', key: 'prefix' }, prefix),
    ...highlightLineSegments(code, language).map((segment, index) =>
      React.createElement('span', {
        key: `${index}-${segment.text}`,
        className: segment.className,
      }, segment.text),
    ),
  ]
}

function compactDiff(oldText: string, newText: string, expanded: boolean, language: string): React.ReactNode {
  if (!oldText && !newText) return null
  const lines: Array<{ kind: 'add' | 'remove' | 'context'; text: string }> = []
  for (const part of diffLines(oldText, newText)) {
    const kind = part.added ? 'add' : part.removed ? 'remove' : 'context'
    const prefix = kind === 'add' ? '+' : kind === 'remove' ? '-' : ' '
    const partLines = part.value.split('\n')
    const normalized = part.value.endsWith('\n') ? partLines.slice(0, -1) : partLines
    for (const line of normalized) {
      lines.push({ kind, text: `${prefix}${line}` })
    }
  }

  return React.createElement('div', { className: 'tool-code-preview tool-diff-preview' },
    React.createElement('div', { className: 'tool-code-preview-head' },
      React.createElement('span', null, 'Diff'),
      React.createElement('span', null, `${lines.length.toLocaleString()} lines`),
    ),
    React.createElement('pre', { className: expanded ? 'tool-code-frame expanded' : 'tool-code-frame' },
      lines.map((line, index) =>
        React.createElement('div', { className: `tool-code-line ${line.kind}`, key: `${index}-${line.text}` },
          React.createElement('span', { className: 'tool-code-text' }, line.text ? renderHighlightedDiffText(line.text, language) : ' '),
        ),
      ),
    ),
  )
}

export function FileEditToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const additions = getDetailNumber(item.details, 'additions')
  const removals = getDetailNumber(item.details, 'removals')
  const replacements = getDetailNumber(item.details, 'replacements')
  const phase = getDetailString(item.details, 'phase')
  const language = languageFromPath(path)
  const rawOldText = typeof item.args.old_string === 'string' ? item.args.old_string : ''
  const rawNewText = typeof item.args.new_string === 'string' ? item.args.new_string : ''
  const oldText = typeof item.args.old_string === 'string' ? preview(item.args.old_string, 72) : ''
  const summary = [
    phase === 'preparing' ? 'preparing' : phase === 'writing' ? 'writing' : undefined,
    replacements !== undefined ? `${replacements} repl` : undefined,
    additions !== undefined ? `+${additions}` : undefined,
    removals !== undefined ? `-${removals}` : undefined,
  ].filter(Boolean).join(' · ')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FilePenLine, { size: 16 }),
    title: 'edit',
    subtitle: [shortPath(path) || oldText || 'file', summary].filter(Boolean).join('  '),
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        replacements !== undefined ? `${replacements} replacements` : undefined,
        additions !== undefined ? `+${additions}` : undefined,
        removals !== undefined ? `-${removals}` : undefined,
        phase,
      ],
    }),
    compactDiff(rawOldText, rawNewText, expanded, language),
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}
