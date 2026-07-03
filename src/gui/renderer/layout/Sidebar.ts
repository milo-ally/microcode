import React, { useState } from 'react'
import { ChevronDown, ChevronRight, FileText, GitBranch, KeyRound, MessageSquare, PanelLeft, Search, Server, Settings, Trash2, Workflow } from 'lucide-react'
import { GlassSelect } from '../components/GlassSelect.ts'
import { ApiConfigPanel } from '../features/settings/ApiConfigPanel.ts'
import { cx } from '../lib/cx.ts'
import type { GuiRuntimeSnapshot } from '../../shared/types.ts'
import type { View } from '../app/viewTypes.ts'

export function Sidebar({ view, snapshot, setView, onToggleCollapse }: {
  view: View
  snapshot?: GuiRuntimeSnapshot
  setView: (view: View) => void
  onToggleCollapse: () => void
}) {
  const [expandedAgents, setExpandedAgents] = useState<Record<string, boolean>>({})
  const [expandedTaskLists, setExpandedTaskLists] = useState<Record<string, boolean>>({})

  if (!snapshot) {
    return React.createElement('aside', { className: 'sidebar' },
      React.createElement('div', { className: 'sidebar-brand' }, 'Microcode'),
      React.createElement('div', { className: 'muted' }, 'Starting runtime...'),
    )
  }

  const nav = React.createElement('div', { className: 'chatgpt-nav' },
    React.createElement('button', {
      className: cx('nav-row', view === 'chat' && 'active'),
      onClick: () => {
        setView('chat')
        void window.microcode.newSession()
      },
    }, React.createElement(MessageSquare, { size: 18 }), '新聊天'),
    React.createElement('button', { className: 'nav-row', onClick: () => setView('sessions') }, React.createElement(Search, { size: 18 }), '搜索聊天'),
    React.createElement('button', { className: cx('nav-row', view === 'sessions' && 'active'), onClick: () => setView('sessions') }, React.createElement(PanelLeft, { size: 18 }), '会话历史'),
    React.createElement('button', { className: cx('nav-row', view === 'agents' && 'active'), onClick: () => setView('agents') }, React.createElement(Workflow, { size: 18 }), '代理'),
    React.createElement('button', { className: cx('nav-row', view === 'tasks' && 'active'), onClick: () => setView('tasks') }, React.createElement(GitBranch, { size: 18 }), '任务'),
    React.createElement('button', { className: cx('nav-row', view === 'mcp' && 'active'), onClick: () => setView('mcp') }, React.createElement(Server, { size: 18 }), 'MCP'),
    React.createElement('button', { className: cx('nav-row', view === 'settings' && 'active'), onClick: () => setView('settings') }, React.createElement(Settings, { size: 18 }), '模型与设置'),
  )

  const recent = React.createElement('div', { className: 'recent-section' },
    React.createElement('div', { className: 'recent-title' }, '最近'),
    snapshot.sessions.slice(0, 28).map((session) =>
      React.createElement('button', {
        className: cx('recent-row', session.id === snapshot.sessionId && 'active'),
        key: session.id,
        onClick: () => void window.microcode.switchSession(session.id),
      }, session.title || session.id.slice(0, 8)),
    ),
  )

  const shell = (content?: React.ReactNode) => React.createElement('aside', { className: 'sidebar' },
    React.createElement('div', { className: 'sidebar-brand' },
      React.createElement('span', null, 'Microcode'),
      React.createElement('button', { title: '折叠侧边栏', onClick: onToggleCollapse }, React.createElement(PanelLeft, { size: 18 })),
    ),
    nav,
    content && React.createElement('div', { className: 'sidebar-panel' }, content),
    !content && recent,
  )

  if (view === 'agents') {
    return shell(React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'panel-title' }, `代理 ${snapshot.runningWorkers}/${snapshot.maxWorkers}`),
      snapshot.agents.length === 0
        ? React.createElement('div', { className: 'empty' }, 'No delegated agents yet.')
        : React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'accordion-list' },
            snapshot.agents.map((agent, index) => {
              const expanded = expandedAgents[agent.task.agentId] ?? index === 0
              const recentTools = agent.toolHistory.slice(-8)
              return React.createElement('section', { className: cx('accordion-item', expanded && 'expanded'), key: agent.task.id },
                React.createElement('button', {
                  className: 'accordion-trigger',
                  type: 'button',
                  'aria-expanded': expanded,
                  onClick: () => setExpandedAgents((current) => ({ ...current, [agent.task.agentId]: !expanded })),
                },
                  expanded ? React.createElement(ChevronDown, { size: 15 }) : React.createElement(ChevronRight, { size: 15 }),
                  React.createElement('span', { className: cx('status-dot', agent.task.status) }),
                  React.createElement('span', { className: 'accordion-title' }, agent.task.description || agent.identity.name || agent.identity.id),
                  React.createElement('small', null, agent.activity || agent.task.status),
                ),
                expanded && React.createElement('div', { className: 'accordion-body detail-card' },
                  React.createElement('div', { className: 'detail-card-head' },
                    React.createElement('strong', null, agent.identity.name || agent.task.agentId),
                    React.createElement('button', {
                      className: 'icon-danger-button',
                      title: '删除代理',
                      onClick: () => void window.microcode.deleteAgent(agent.task.agentId),
                    }, React.createElement(Trash2, { size: 14 })),
                  ),
                  React.createElement('div', { className: 'detail-kv' },
                    React.createElement('span', null, 'Status'),
                    React.createElement('strong', null, agent.task.status),
                  ),
                  React.createElement('div', { className: 'detail-kv' },
                    React.createElement('span', null, 'Role'),
                    React.createElement('strong', null, agent.task.role || 'worker'),
                  ),
                  React.createElement('div', { className: 'detail-kv' },
                    React.createElement('span', null, 'Usage'),
                    React.createElement('strong', null, `${agent.task.usage.toolCalls} tools · ${agent.task.usage.tokens} tokens`),
                  ),
                  agent.activity && React.createElement('p', { className: 'detail-note' }, agent.activity),
                  React.createElement('div', { className: 'sidebar-label' }, 'Prompt'),
                  React.createElement('pre', { className: 'detail-pre' }, agent.task.prompt),
                  recentTools.length > 0 && React.createElement(React.Fragment, null,
                    React.createElement('div', { className: 'sidebar-label' }, 'Recent tools'),
                    recentTools.map((tool, toolIndex) =>
                      React.createElement('div', { className: cx('tool-mini-row', tool.done && 'done', tool.error && 'error'), key: `${tool.name}-${tool.startedAt ?? toolIndex}` },
                        React.createElement('span', null, tool.name),
                        React.createElement('small', null, tool.status || tool.detail || (tool.done ? 'done' : 'running')),
                      ),
                    ),
                  ),
                ),
              )
            }),
          ),
        ),
    ))
  }

  if (view === 'mcp') {
    return shell(React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'panel-title' }, 'MCP Servers'),
      snapshot.mcpServers.length === 0
        ? React.createElement('div', { className: 'empty' }, 'No MCP servers connected.')
        : snapshot.mcpServers.map((server) =>
            React.createElement('div', { className: 'side-row', key: server.name },
              React.createElement('span', { className: cx('status-dot', server.status) }),
              React.createElement('div', { className: 'side-row-main' },
                React.createElement('strong', null, server.name),
                React.createElement('span', null, `${server.status} · ${server.tools.length} tools · ${server.resources.length} resources`),
                React.createElement('div', { className: 'inline-actions' },
                  server.status === 'disabled'
                    ? React.createElement('button', { onClick: () => void window.microcode.mcpAction('enable', server.name) }, 'Enable')
                    : React.createElement('button', { onClick: () => void window.microcode.mcpAction('disable', server.name) }, 'Disable'),
                  React.createElement('button', { onClick: () => void window.microcode.mcpAction('reconnect', server.name) }, 'Reconnect'),
                ),
              ),
            ),
          ),
    ))
  }

  if (view === 'tasks') {
    return shell(React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'panel-title' }, '当前会话任务'),
      snapshot.tasks.length === 0
        ? React.createElement('div', { className: 'empty' }, '当前 session 还没有任务。')
        : React.createElement(React.Fragment, null,
          React.createElement('div', { className: 'accordion-list' },
            snapshot.tasks.map((list, index) => {
              const expanded = expandedTaskLists[list.id] ?? index === 0
              const stats = list.stats ?? {
                total: list.tasks.length,
                completed: list.tasks.filter((task) => task.completed).length,
                inProgress: list.tasks.filter((task) => !task.completed && task.pending).length,
                remaining: list.tasks.filter((task) => !task.completed && !task.pending).length,
              }
              return React.createElement('section', { className: cx('accordion-item', expanded && 'expanded'), key: list.id },
                React.createElement('button', {
                  className: 'accordion-trigger',
                  type: 'button',
                  'aria-expanded': expanded,
                  onClick: () => setExpandedTaskLists((current) => ({ ...current, [list.id]: !expanded })),
                },
                  expanded ? React.createElement(ChevronDown, { size: 15 }) : React.createElement(ChevronRight, { size: 15 }),
                  React.createElement(FileText, { size: 15 }),
                  React.createElement('span', { className: 'accordion-title' }, list.title),
                  React.createElement('small', null, `${stats.completed}/${stats.total}`),
                ),
                expanded && React.createElement('div', { className: 'accordion-body detail-card task-detail-card' },
                  React.createElement('div', { className: 'task-stats-grid' },
                    React.createElement('span', null, `total ${stats.total}`),
                    React.createElement('span', null, `done ${stats.completed}`),
                    React.createElement('span', null, `doing ${stats.inProgress}`),
                    React.createElement('span', null, `left ${stats.remaining}`),
                  ),
                  list.tasks.map((item) =>
                    React.createElement('article', { className: cx('task-detail-row', item.completed && 'completed', item.pending && 'pending'), key: item.id },
                      React.createElement('div', { className: 'task-detail-top' },
                        React.createElement('span', { className: cx('task-state-pill', item.completed ? 'done' : item.pending ? 'pending' : 'todo') },
                          item.completed ? 'done' : item.pending ? 'pending' : 'todo',
                        ),
                        React.createElement('label', { className: 'task-reminder-toggle' },
                          React.createElement('input', {
                            type: 'checkbox',
                            checked: item.reminder === true,
                            disabled: item.completed,
                            onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                              void window.microcode.remindTask(list.id, item.id, event.currentTarget.checked),
                          }),
                          'priority',
                        ),
                      ),
                      React.createElement('strong', null, item.content),
                      React.createElement('small', null, `updated ${new Date(item.updatedAt).toLocaleString()}`),
                    ),
                  ),
                ),
              )
            }),
          ),
        ),
    ))
  }

  if (view === 'settings') {
    return shell(React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'panel-title' }, '模型与设置'),
      React.createElement('div', { className: 'setting-block' },
        React.createElement('label', null, 'Model'),
        React.createElement(GlassSelect, {
          value: `${snapshot.agent.model.id}|${snapshot.agent.model.api}`,
          ariaLabel: 'Model',
          onChange: (nextValue) => void window.microcode.setModel(nextValue),
          options: snapshot.models.map((model) => ({
            value: `${model.id}|${model.api}`,
            label: model.name,
            meta: `${model.provider} · ${model.api}${model.apiKeyConfigured ? '' : ' · no key'}`,
            missing: !model.apiKeyConfigured,
          })),
        }),
      ),
      React.createElement('div', { className: 'setting-block' },
        React.createElement('label', null, 'Permission'),
        React.createElement(GlassSelect, {
          value: snapshot.agent.permission.mode,
          ariaLabel: 'Permission',
          onChange: (nextValue) => void window.microcode.setPermissionMode(nextValue as any),
          options: ['interactive', 'auto-approve', 'plan'].map((mode) => ({
            value: mode,
            label: mode,
          })),
        }),
      ),
      React.createElement('div', { className: 'setting-block' },
        React.createElement('label', null, 'Thinking'),
        React.createElement(GlassSelect, {
          value: snapshot.agent.thinkingLevel,
          ariaLabel: 'Thinking',
          onChange: (nextValue) => void window.microcode.setThinkingLevel(nextValue as any),
          options: ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'].map((level) => ({
            value: level,
            label: level,
          })),
        }),
      ),
      React.createElement(ApiConfigPanel, { snapshot }),
      React.createElement('div', { className: 'sidebar-section' },
        React.createElement('div', { className: 'sidebar-label' }, 'API Configuration'),
        React.createElement('div', { className: 'config-path' }, snapshot.config.userConfigPath),
        React.createElement('div', { className: 'config-path' }, snapshot.config.projectConfigPath),
        Object.entries(snapshot.config.modelEnv).map(([key, present]) =>
          React.createElement('div', { className: 'kv', key },
            React.createElement('span', null, key),
            React.createElement('strong', { className: present ? 'ok' : 'missing' }, present ? 'set' : 'missing'),
          ),
        ),
      ),
      React.createElement('div', { className: 'sidebar-section' },
        React.createElement('div', { className: 'sidebar-label' }, 'Available Models'),
        snapshot.models.map((model) =>
          React.createElement('button', {
            key: `${model.id}|${model.api}`,
            className: cx('model-row', model.current && 'active'),
            onClick: () => void window.microcode.setModel(`${model.id}|${model.api}`),
          },
            React.createElement('span', { className: 'model-title' }, model.name),
            React.createElement('span', null, `${model.provider} · ${model.api}`),
            React.createElement('span', null, `${model.reasoning ? 'reasoning' : 'standard'}${model.vision ? ' · vision' : ''}`),
            React.createElement('span', { className: model.apiKeyConfigured ? 'ok' : 'missing' },
              React.createElement(KeyRound, { size: 12 }),
              model.apiKeyEnv,
            ),
          ),
        ),
      ),
    ))
  }

  if (view === 'sessions') {
    return shell(React.createElement(React.Fragment, null,
      React.createElement('div', { className: 'panel-title' }, '会话历史'),
      React.createElement('button', { className: 'wide-action', onClick: () => void window.microcode.newSession() }, 'New Session'),
      snapshot.sessions.length === 0
        ? React.createElement('div', { className: 'empty' }, 'No saved sessions found.')
        : snapshot.sessions.map((session) =>
            React.createElement('button', {
              className: cx('session-row', session.id === snapshot.sessionId && 'active'),
              key: session.id,
              onClick: () => void window.microcode.switchSession(session.id),
            },
              React.createElement('strong', null, session.title || '(no title)'),
              React.createElement('span', null, `${session.id.slice(0, 8)} · ${session.createdAt ? new Date(session.createdAt).toLocaleString() : ''}`),
              React.createElement('span', null, session.cwd),
            ),
          ),
    ))
  }

  return shell()
}
