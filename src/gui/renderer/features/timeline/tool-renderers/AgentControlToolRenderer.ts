import React from 'react'
import { Bot, Cpu, GitBranch, Send } from 'lucide-react'
import { joinParts, MetricRow, OutputBlock, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function AgentControlToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const title = controlTitle(item.toolName)
  const subtitle = controlSubtitle(item)
  return React.createElement(ToolFrame, {
    item,
    icon: controlIcon(item.toolName),
    title,
    subtitle,
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        typeof item.details?.agentId === 'string' ? `agent ${item.details.agentId}` : undefined,
        typeof item.details?.batchId === 'string' ? `batch ${item.details.batchId}` : undefined,
        Array.isArray(item.details?.tasks) ? `${item.details.tasks.length} tasks` : undefined,
        Array.isArray(item.details?.worktrees) ? `${item.details.worktrees.length} worktrees` : undefined,
      ],
    }),
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

function controlTitle(toolName: string): string {
  switch (toolName) {
    case 'spawn': return 'spawn'
    case 'message': return 'message'
    case 'stop': return 'stop'
    case 'delete': return 'delete'
    case 'status': return 'status'
    case 'worktree': return 'worktree'
    default: return toolName
  }
}

function controlSubtitle(item: { toolName: string; args: Record<string, unknown>; details?: Record<string, unknown>; summary?: string }): string | undefined {
  if (item.toolName === 'spawn') {
    return typeof item.args.description === 'string' ? preview(item.args.description, 110) : 'launch worker'
  }
  if (item.toolName === 'message') {
    return joinParts([
      typeof item.args.agent_id === 'string' ? item.args.agent_id : undefined,
      typeof item.args.message === 'string' ? preview(item.args.message, 90) : undefined,
    ])
  }
  if (item.toolName === 'worktree') {
    return joinParts([
      typeof item.args.action === 'string' ? item.args.action : undefined,
      typeof item.args.agent_id === 'string' ? item.args.agent_id : undefined,
      typeof item.args.batch_id === 'string' ? item.args.batch_id : undefined,
    ]) || 'worktree'
  }
  if (typeof item.args.agent_id === 'string') return item.args.agent_id
  return item.summary
}

function controlIcon(toolName: string): React.ReactNode {
  if (toolName === 'spawn') return React.createElement(Bot, { size: 16 })
  if (toolName === 'message') return React.createElement(Send, { size: 16 })
  if (toolName === 'worktree') return React.createElement(GitBranch, { size: 16 })
  return React.createElement(Cpu, { size: 16 })
}

