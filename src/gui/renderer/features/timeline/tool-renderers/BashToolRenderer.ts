import React from 'react'
import { Terminal } from 'lucide-react'
import { getDetailNumber, joinParts, OutputBlock, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function BashToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const command = typeof item.args.command === 'string' ? item.args.command : ''
  const description = typeof item.args.description === 'string' ? item.args.description : ''
  const exitCode = getDetailNumber(item.details, 'exitCode')
  const subtitle = description || (command ? `$ ${preview(command, expanded ? 180 : 96)}` : 'Running shell command')
  const output = typeof item.details?.output === 'string' ? item.details.output : item.output
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Terminal, { size: 16 }),
    title: 'bash',
    subtitle,
  },
    exitCode !== undefined && item.status !== 'running' && React.createElement('div', {
      className: `tool-exit ${exitCode === 0 ? 'ok' : 'error'}`,
    }, `exit ${exitCode}`),
    React.createElement(OutputBlock, {
      item,
      output,
      expanded,
      onToggleExpanded,
      label: joinParts([exitCode !== undefined ? `Output` : undefined]) || 'Output',
      preferTailWhileRunning: true,
    }),
  )
}

