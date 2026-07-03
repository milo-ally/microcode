import React from 'react'
import { FileSearch } from 'lucide-react'
import { getDetailNumber, MetricRow, OutputBlock, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function GrepToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const pattern = typeof item.args.pattern === 'string' ? item.args.pattern : ''
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FileSearch, { size: 16 }),
    title: 'grep',
    subtitle: pattern ? `/${preview(pattern, 90)}/` : 'content search',
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        numberMetric(item.details, 'numMatches', 'matches'),
        numberMetric(item.details, 'numFiles', 'files'),
        numberMetric(item.details, 'numLines', 'lines'),
        item.details?.truncated === true ? 'truncated' : undefined,
      ],
    }),
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}

function numberMetric(details: Record<string, unknown> | undefined, key: string, noun: string): string | undefined {
  const value = getDetailNumber(details, key)
  return value === undefined ? undefined : `${value.toLocaleString()} ${noun}`
}

