import React from 'react'
import { FilePenLine } from 'lucide-react'
import { getDetailNumber, getDetailString, MetricRow, OutputBlock, preview, shortPath, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function FileEditToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const additions = getDetailNumber(item.details, 'additions')
  const removals = getDetailNumber(item.details, 'removals')
  const replacements = getDetailNumber(item.details, 'replacements')
  const phase = getDetailString(item.details, 'phase')
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
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}
