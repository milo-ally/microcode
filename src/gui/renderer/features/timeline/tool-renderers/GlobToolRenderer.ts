import React from 'react'
import { Search } from 'lucide-react'
import { getDetailNumber, MetricRow, OutputBlock, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function GlobToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const pattern = typeof item.args.pattern === 'string' ? item.args.pattern : ''
  const filenames = Array.isArray(item.details?.filenames) ? item.details.filenames as string[] : []
  const output = filenames.slice(0, expanded ? 200 : 16).join('\n')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Search, { size: 16 }),
    title: 'glob',
    subtitle: pattern || 'file search',
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        numberMetric(item.details, 'numFiles', 'files'),
        item.details?.truncated === true ? 'truncated' : undefined,
      ],
    }),
    output && React.createElement(OutputBlock, { item, output, expanded, onToggleExpanded, label: 'Files' }),
  )
}

function numberMetric(details: Record<string, unknown> | undefined, key: string, noun: string): string | undefined {
  const value = getDetailNumber(details, key)
  return value === undefined ? undefined : `${value.toLocaleString()} ${noun}`
}

