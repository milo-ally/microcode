import React from 'react'
import { Globe } from 'lucide-react'
import { getDetailNumber, getDetailString, MetricRow, OutputBlock, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function WebFetchToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const url = getDetailString(item.details, 'finalUrl') ?? getDetailString(item.details, 'url') ?? (typeof item.args.url === 'string' ? item.args.url : '')
  const code = getDetailNumber(item.details, 'code')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Globe, { size: 16 }),
    title: 'WebFetch',
    subtitle: preview(url, 100) || 'web page',
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        code !== undefined ? `HTTP ${code}` : undefined,
        getDetailString(item.details, 'contentType'),
        numberMetric(item.details, 'bytes', 'bytes'),
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

