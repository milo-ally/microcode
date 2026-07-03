import React from 'react'
import { Cpu } from 'lucide-react'
import { joinParts, MetricRow, OutputBlock, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function FallbackToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const subtitle = item.summary || item.statusText || undefined
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Cpu, { size: 16 }),
    title: item.toolName,
    subtitle,
    expanded,
    onToggleExpanded,
  },
    !subtitle && React.createElement(MetricRow, { parts: [joinParts([])] }),
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

