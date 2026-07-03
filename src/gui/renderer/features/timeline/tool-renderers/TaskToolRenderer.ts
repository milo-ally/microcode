import React from 'react'
import { ListChecks } from 'lucide-react'
import { MetricRow, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function TaskToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
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
    expanded,
    onToggleExpanded,
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

