import React from 'react'
import { Bot, CircleHelp, Cpu, GitBranch, Image, ListChecks, PlugZap, Send, Wrench } from 'lucide-react'
import { joinParts, MetricRow, OutputBlock, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function TaskToolRenderer({ item }: ToolRendererProps) {
  const action = typeof item.args.action === 'string'
    ? item.args.action
    : typeof item.details?.action === 'string'
      ? item.details.action
      : 'manage'
  const list = item.details?.list && typeof item.details.list === 'object' ? item.details.list as any : undefined
  const tasks = Array.isArray(list?.tasks) ? list.tasks : Array.isArray(item.args.tasks) ? item.args.tasks : []
  const title = typeof list?.title === 'string'
    ? list.title
    : typeof item.args.title === 'string'
      ? item.args.title
      : 'Task list'
  const rows = tasks.slice(0, 8).map((task: any, index: number) => {
    const content = typeof task === 'string'
      ? task
      : typeof task?.content === 'string'
        ? task.content
        : `Task ${index + 1}`
    const completed = task?.completed === true || task?.status === 'completed'
    return React.createElement('li', {
      key: `${content}-${index}`,
      className: completed ? 'complete' : undefined,
    }, React.createElement('span', null, completed ? 'done' : 'todo'), preview(content, 120))
  })
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(ListChecks, { size: 16 }),
    title: 'task',
    subtitle: `${action} · ${title}`,
  },
    React.createElement(MetricRow, {
      parts: [
        tasks.length > 0 ? `${tasks.length} tasks` : undefined,
        typeof list?.stats?.completed === 'number' ? `${list.stats.completed} complete` : undefined,
        typeof list?.stats?.remaining === 'number' ? `${list.stats.remaining} remaining` : undefined,
      ],
    }),
    rows.length > 0 && React.createElement('ul', { className: 'tool-task-list' }, rows),
  )
}

export function AskToolRenderer({ item }: ToolRendererProps) {
  const questions = Array.isArray(item.details?.questions)
    ? item.details.questions as any[]
    : Array.isArray(item.args.questions)
      ? item.args.questions as any[]
      : []
  const answers = item.details?.answers && typeof item.details.answers === 'object'
    ? item.details.answers as Record<string, unknown>
    : undefined
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(CircleHelp, { size: 16 }),
    title: 'Ask',
    subtitle: questions[0]?.question ? preview(String(questions[0].question), 110) : 'user question',
  },
    React.createElement(MetricRow, {
      parts: [
        questions.length > 0 ? `${questions.length} questions` : undefined,
        answers ? `${Object.keys(answers).length} answers` : undefined,
      ],
    }),
  )
}

export function VisionToolRenderer({ item }: ToolRendererProps) {
  const source = typeof item.details?.source === 'string'
    ? item.details.source
    : typeof item.args.image_source === 'string'
      ? item.args.image_source
      : 'image'
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Image, { size: 16 }),
    title: 'vision',
    subtitle: preview(source, 100),
  },
    React.createElement(MetricRow, {
      parts: [
        typeof item.details?.sourceType === 'string' ? item.details.sourceType : undefined,
        typeof item.details?.mimeType === 'string' ? item.details.mimeType : undefined,
      ],
    }),
  )
}

export function FallbackToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const subtitle = item.summary || item.statusText || undefined
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Cpu, { size: 16 }),
    title: item.toolName,
    subtitle,
  },
    !subtitle && React.createElement(MetricRow, { parts: [joinParts([])] }),
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

export function AgentControlToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const title = controlTitle(item.toolName)
  const subtitle = controlSubtitle(item)
  return React.createElement(ToolFrame, {
    item,
    icon: controlIcon(item.toolName),
    title,
    subtitle,
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
  },
    React.createElement(MetricRow, {
      parts: [
        typeof item.details?.filePath === 'string' ? item.details.filePath : undefined,
      ],
    }),
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

export function ToolSearchRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const query = typeof item.args.query === 'string' ? item.args.query : 'tools'
  const matches = Array.isArray(item.details?.matches) ? item.details.matches as unknown[] : undefined
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Wrench, { size: 16 }),
    title: 'search',
    subtitle: `tool search · ${preview(query, 100)}`,
  },
    React.createElement(MetricRow, {
      parts: [matches ? `${matches.length} matches` : undefined],
    }),
    React.createElement(OutputBlock, { item, expanded, onToggleExpanded }),
  )
}

export function McpToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const [, server = 'mcp', tool = item.toolName] = item.toolName.split('__')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(PlugZap, { size: 16 }),
    title: `MCP ${tool}`,
    subtitle: server,
  },
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
