import React from 'react'
import { ChevronLeft, ChevronRight, Workflow } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import type { GuiRuntimeSnapshot } from '../../../shared/types.ts'
import type { AgentRuntimeState } from '../../../../swarm/types.ts'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'blocked'])
const TOOL_HISTORY_LIMIT = 5

function agentIcon(status: string): string {
  if (status === 'queued') return '○'
  if (status === 'running') return '●'
  if (status === 'blocked') return '!'
  if (status === 'completed') return '✓'
  if (status === 'failed') return '✗'
  return '■'
}

function toolIcon(tool: { done: boolean; error: boolean }): string {
  if (!tool.done) return '●'
  return tool.error ? '✗' : '✓'
}

function formatElapsed(startedAt?: number): string {
  if (!startedAt) return ''
  const totalSecs = (Date.now() - startedAt) / 1000
  if (totalSecs < 1) return `${totalSecs.toFixed(1)}s`
  if (totalSecs < 60) return `${Math.floor(totalSecs)}s`
  const mins = Math.floor(totalSecs / 60)
  const secs = Math.floor(totalSecs % 60)
  return `${mins}m ${secs}s`
}

function partitionAgents(agents: readonly AgentRuntimeState[]): {
  active: AgentRuntimeState[]
  terminal: AgentRuntimeState[]
} {
  const active: AgentRuntimeState[] = []
  const terminal: AgentRuntimeState[] = []
  for (const agent of agents) {
    if (ACTIVE_STATUSES.has(agent.task.status)) active.push(agent)
    else terminal.push(agent)
  }
  terminal.sort((a, b) => (b.task.completedAt ?? 0) - (a.task.completedAt ?? 0))
  return { active, terminal }
}

export function AgentActivityPanel({
  snapshot,
  collapsed = false,
  onToggleCollapsed,
}: {
  snapshot?: GuiRuntimeSnapshot
  collapsed?: boolean
  onToggleCollapsed?: () => void
}) {
  const agents = snapshot?.agents ?? []
  if (agents.length === 0) return null

  if (collapsed) {
    return React.createElement('button', {
      className: 'agent-drawer-tab',
      type: 'button',
      title: '展开并行代理',
      onClick: onToggleCollapsed,
    },
      React.createElement(ChevronLeft, { size: 15 }),
      React.createElement(Workflow, { size: 16 }),
      React.createElement('span', null, `${snapshot?.runningWorkers ?? 0}/${snapshot?.maxWorkers ?? 0}`),
    )
  }

  return React.createElement('aside', { className: 'agent-activity-panel', 'aria-label': 'Agent activity' },
    React.createElement('div', { className: 'agent-panel-head' },
      React.createElement('div', null,
        React.createElement(Workflow, { size: 16 }),
        React.createElement('strong', null, '并行代理'),
      ),
      React.createElement('div', { className: 'agent-panel-actions' },
        React.createElement('span', null, `${snapshot?.runningWorkers ?? 0}/${snapshot?.maxWorkers ?? 0} running`),
        React.createElement('button', {
          type: 'button',
          title: '折叠并行代理',
          onClick: onToggleCollapsed,
        }, React.createElement(ChevronRight, { size: 15 })),
      ),
    ),
    React.createElement('div', { className: 'agent-tree' },
      (() => {
        const { active, terminal } = partitionAgents(agents)
        const rows: React.ReactNode[] = []

        active.forEach((agent, agentIndex) => {
          const isLastAgent = agentIndex === active.length - 1 && terminal.length === 0
          const agentBranch = isLastAgent ? '└─' : '├─'
          const childPrefix = isLastAgent ? '   ' : '│  '
          const recentTools = agent.toolHistory.slice(-TOOL_HISTORY_LIMIT)
          const activeTool = [...agent.toolHistory].reverse().find((tool) => !tool.done)

          rows.push(React.createElement('div', { className: cx('agent-tree-row agent-row', agent.task.status), key: `${agent.task.id}-agent` },
            React.createElement('span', { className: 'tree-branch' }, agentBranch),
            React.createElement('span', { className: 'tree-icon' }, agentIcon(agent.task.status)),
            React.createElement('span', { className: 'tree-main' },
              React.createElement('strong', null, agent.task.description || agent.identity.name || agent.identity.id),
              React.createElement('small', null, [
                formatElapsed(agent.task.startedAt),
                agent.task.status === 'queued' ? 'waiting' : agent.activity || activeTool?.status || activeTool?.detail || 'running',
              ].filter(Boolean).join(' · ')),
            ),
          ))

          recentTools.forEach((tool, toolIndex) => {
            const isLastTool = toolIndex === recentTools.length - 1
            rows.push(React.createElement('div', {
              className: cx('agent-tree-row tool-row', tool.done && 'done', tool.error && 'error', !tool.done && 'running'),
              key: `${agent.task.id}-${tool.name}-${tool.startedAt ?? toolIndex}-${toolIndex}`,
              title: [tool.name, tool.detail, tool.status].filter(Boolean).join(' · '),
            },
              React.createElement('span', { className: 'tree-branch dim' }, `${childPrefix}${isLastTool ? '└─' : '├─'}`),
              React.createElement('span', { className: 'tree-icon' }, toolIcon(tool)),
              React.createElement('span', { className: 'tree-main' },
                React.createElement('strong', null, tool.name),
                React.createElement('small', null, [
                  !tool.done ? tool.status : undefined,
                  tool.detail,
                  !tool.done ? formatElapsed(tool.startedAt) : undefined,
                ].filter(Boolean).join(' · ')),
              ),
            ))
          })

          if (agent.toolHistory.length > TOOL_HISTORY_LIMIT) {
            rows.push(React.createElement('div', { className: 'agent-tree-row more-row', key: `${agent.task.id}-more` },
              React.createElement('span', { className: 'tree-branch dim' }, `${childPrefix}   `),
              React.createElement('span', { className: 'tree-main' }, `…${agent.toolHistory.length - TOOL_HISTORY_LIMIT} more`),
            ))
          }
        })

        terminal.slice(0, 6).forEach((agent, index) => {
          const branch = index === terminal.length - 1 && active.length === 0 ? '└─' : '├─'
          const lastTool = agent.toolHistory.at(-1)
          rows.push(React.createElement('div', { className: cx('agent-tree-row agent-row terminal', agent.task.status), key: `${agent.task.id}-terminal` },
            React.createElement('span', { className: 'tree-branch' }, branch),
            React.createElement('span', { className: 'tree-icon' }, agentIcon(agent.task.status)),
            React.createElement('span', { className: 'tree-main' },
              React.createElement('strong', null, agent.task.description || agent.identity.name || agent.identity.id),
              React.createElement('small', null, lastTool
                ? `${toolIcon(lastTool)} ${lastTool.name}${lastTool.detail ? ` · ${lastTool.detail}` : ''}${agent.toolHistory.length > 1 ? ` · ${agent.toolHistory.length} tools` : ''}`
                : agent.task.status),
            ),
          ))
        })

        if (terminal.length > 6) {
          rows.push(React.createElement('div', { className: 'agent-tree-row more-row', key: 'terminal-more' },
            React.createElement('span', { className: 'tree-branch dim' }, '   '),
            React.createElement('span', { className: 'tree-main' }, `…and ${terminal.length - 6} more completed`),
          ))
        }

        return rows
      })(),
    ),
  )
}
