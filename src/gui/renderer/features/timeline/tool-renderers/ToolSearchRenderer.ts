import React from 'react'
import { Wrench } from 'lucide-react'
import { MetricRow, OutputBlock, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function ToolSearchRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const query = typeof item.args.query === 'string' ? item.args.query : 'tools'
  const matches = Array.isArray(item.details?.matches) ? item.details.matches as unknown[] : undefined
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Wrench, { size: 16 }),
    title: 'search',
    subtitle: `tool search · ${preview(query, 100)}`,
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [matches ? `${matches.length} matches` : undefined],
    }),
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

