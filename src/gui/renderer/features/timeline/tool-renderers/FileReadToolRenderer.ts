import React from 'react'
import { FileText } from 'lucide-react'
import { getDetailNumber, getDetailString, MetricRow, OutputBlock, shortPath, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function FileReadToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const returned = getDetailNumber(item.details, 'returnedLines')
  const total = getDetailNumber(item.details, 'totalLines')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FileText, { size: 16 }),
    title: 'read',
    subtitle: shortPath(path) || 'file',
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        returned !== undefined && total !== undefined ? `${returned}/${total} lines` : undefined,
        item.details?.truncated === true ? 'truncated' : undefined,
      ],
    }),
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}

