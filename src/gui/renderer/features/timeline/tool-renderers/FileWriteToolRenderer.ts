import React from 'react'
import { FileUp } from 'lucide-react'
import { formatBytes, getDetailNumber, getDetailString, MetricRow, OutputBlock, shortPath, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function FileWriteToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const previewText = getDetailString(item.details, 'preview')
  const warning = getDetailString(item.details, 'warning')
  const additions = getDetailNumber(item.details, 'additions')
  const removals = getDetailNumber(item.details, 'removals')
  const phase = getDetailString(item.details, 'phase')
  const byteText = formatBytes(item.details?.bytesWritten)
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
    previewText && React.createElement(OutputBlock, {
      item,
      output: previewText,
      expanded,
      onToggleExpanded,
      label: 'Preview',
    }),
  )
}
