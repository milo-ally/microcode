import React from 'react'
import { Wrench } from 'lucide-react'
import { MetricRow, OutputBlock, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function SkillToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const skill = typeof item.args.skill === 'string'
    ? item.args.skill
    : typeof item.details?.skillName === 'string'
      ? item.details.skillName
      : 'skill'
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Wrench, { size: 16 }),
    title: 'skill',
    subtitle: skill,
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        typeof item.details?.filePath === 'string' ? item.details.filePath : undefined,
      ],
    }),
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

