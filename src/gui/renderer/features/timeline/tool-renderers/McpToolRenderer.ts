import React from 'react'
import { PlugZap } from 'lucide-react'
import { OutputBlock, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function McpToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const [, server = 'mcp', tool = item.toolName] = item.toolName.split('__')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(PlugZap, { size: 16 }),
    title: `MCP ${tool}`,
    subtitle: server,
    expanded,
    onToggleExpanded,
  },
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

