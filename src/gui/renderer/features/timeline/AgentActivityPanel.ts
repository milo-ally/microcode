import React from 'react'
import { Workflow } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import type { GuiRuntimeSnapshot } from '../../../shared/types.ts'

export function AgentActivityPanel({ snapshot }: { snapshot?: GuiRuntimeSnapshot }) {
  const agents = snapshot?.agents ?? []
  if (agents.length === 0) return null

  return React.createElement('section', { className: 'agent-activity-panel' },
    React.createElement('div', { className: 'agent-panel-head' },
      React.createElement('div', null,
        React.createElement(Workflow, { size: 16 }),
        React.createElement('strong', null, '并行代理'),
      ),
      React.createElement('span', null, `${snapshot?.runningWorkers ?? 0}/${snapshot?.maxWorkers ?? 0} running`),
    ),
    React.createElement('div', { className: 'agent-lanes' },
      agents.map((agent) => {
        const recentTools = agent.toolHistory.slice(-5)
        const activeTool = [...agent.toolHistory].reverse().find((tool) => !tool.done)
        return React.createElement('article', { className: cx('agent-lane', agent.task.status), key: agent.task.id },
          React.createElement('div', { className: 'agent-lane-top' },
            React.createElement('span', { className: cx('status-dot', agent.task.status) }),
            React.createElement('div', { className: 'agent-lane-title' },
              React.createElement('strong', null, agent.identity.name || agent.identity.id),
              React.createElement('span', null, agent.task.description || agent.task.prompt),
            ),
            React.createElement('span', { className: 'agent-state' }, agent.task.status),
          ),
          React.createElement('div', { className: 'agent-activity' },
            agent.activity || activeTool?.status || activeTool?.detail || 'Waiting for work',
          ),
          recentTools.length > 0 && React.createElement('div', { className: 'agent-tool-strip' },
            recentTools.map((tool, index) =>
              React.createElement('div', {
                className: cx('agent-tool-chip', tool.done && 'done', tool.error && 'error', !tool.done && 'running'),
                key: `${tool.name}-${tool.startedAt ?? index}-${index}`,
                title: [tool.name, tool.detail, tool.status].filter(Boolean).join(' · '),
              },
                !tool.done && React.createElement('span', { className: 'mini-spinner' }),
                React.createElement('span', null, tool.name),
              ),
            ),
          ),
          React.createElement('div', { className: 'agent-metrics' },
            React.createElement('span', null, `${agent.task.usage.toolCalls} tools`),
            React.createElement('span', null, `${agent.task.usage.tokens} tokens`),
          ),
        )
      }),
    ),
  )
}
