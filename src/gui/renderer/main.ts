import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { marked } from 'marked'
import {
  Bot,
  Check,
  ChevronDown,
  ChevronRight,
  CircleStop,
  Cpu,
  FileText,
  GitBranch,
  HelpCircle,
  KeyRound,
  MessageSquare,
  PanelLeft,
  Play,
  Search,
  Send,
  Server,
  Settings,
  Sparkles,
  Terminal,
  Workflow,
  X,
} from 'lucide-react'
import type {
  GuiChatItem,
  GuiIpcEvent,
  GuiPermissionItem,
  GuiRuntimeSnapshot,
  GuiToolItem,
} from '../shared/types.ts'
import './styles.css'

type View = 'chat' | 'sessions' | 'agents' | 'tasks' | 'mcp' | 'settings'

const COMMANDS = [
  '/clear',
  '/compact',
  '/status',
  '/model',
  '/thinking',
  '/mcp',
  '/session',
  '/tasks',
  '/agents',
  '/new',
  '/permission',
  '/skills',
  '/help',
]

function cx(...classes: Array<string | false | undefined>): string {
  return classes.filter(Boolean).join(' ')
}

function textFromArgs(args: Record<string, unknown>): string {
  const entries = Object.entries(args)
  if (entries.length === 0) return ''
  return entries
    .slice(0, 4)
    .map(([key, value]) => {
      const raw = typeof value === 'string' ? value : JSON.stringify(value)
      return `${key}=${raw.length > 72 ? `${raw.slice(0, 72)}...` : raw}`
    })
    .join('  ')
}

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => marked.parse(text, { async: false }) as string, [text])
  return React.createElement('div', {
    className: 'markdown',
    dangerouslySetInnerHTML: { __html: html },
  })
}

function ActivityButton(props: {
  active: boolean
  label: string
  icon: React.ReactNode
  onClick: () => void
}) {
  return React.createElement(
    'button',
    {
      className: cx('activity-button', props.active && 'active'),
      title: props.label,
      onClick: props.onClick,
    },
    props.icon,
  )
}

type SelectOption = {
  value: string
  label: string
  meta?: string
  missing?: boolean
}

function GlassSelect({ value, options, onChange, ariaLabel }: {
  value: string
  options: SelectOption[]
  onChange: (value: string) => void
  ariaLabel: string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const selected = options.find((option) => option.value === value) ?? options[0]

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [open])

  return React.createElement('div', { className: cx('glass-select', open && 'open'), ref: rootRef },
    React.createElement('button', {
      type: 'button',
      className: 'glass-select-trigger',
      'aria-label': ariaLabel,
      'aria-expanded': open,
      onClick: () => setOpen((current) => !current),
    },
      React.createElement('span', { className: 'glass-select-value' }, selected?.label ?? value),
      React.createElement(ChevronDown, { size: 16 }),
    ),
    open && React.createElement('div', { className: 'glass-select-menu', role: 'listbox' },
      options.map((option) =>
        React.createElement('button', {
          type: 'button',
          key: option.value,
          className: cx('glass-select-option', option.value === value && 'selected'),
          role: 'option',
          'aria-selected': option.value === value,
          onClick: () => {
            setOpen(false)
            if (option.value !== value) onChange(option.value)
          },
        },
          React.createElement('span', null, option.label),
          option.meta && React.createElement('small', { className: option.missing ? 'missing' : undefined }, option.meta),
        ),
      ),
    ),
  )
}

function ApiConfigPanel({ snapshot }: { snapshot: GuiRuntimeSnapshot }) {
  const modelKey = `${snapshot.agent.model.id}|${snapshot.agent.model.api}`
  const currentModel = snapshot.models.find((model) => `${model.id}|${model.api}` === modelKey)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState(snapshot.agent.model.baseUrl)

  useEffect(() => {
    setApiKey('')
    setBaseUrl(snapshot.agent.model.baseUrl)
  }, [snapshot.agent.model.id, snapshot.agent.model.api, snapshot.agent.model.baseUrl])

  return React.createElement('div', { className: 'api-glass-panel' },
    React.createElement('div', { className: 'api-panel-head' },
      React.createElement('strong', null, 'API 配置'),
      React.createElement('span', null, currentModel?.apiKeyConfigured ? '已配置 key' : '缺少 key'),
    ),
    React.createElement('label', { className: 'glass-field' },
      React.createElement('span', null, currentModel?.apiKeyEnv ?? 'API Key'),
      React.createElement('input', {
        type: 'password',
        value: apiKey,
        placeholder: currentModel?.apiKeyConfigured ? '留空则保持当前 key' : '输入 API key',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setApiKey(event.currentTarget.value),
      }),
    ),
    React.createElement('label', { className: 'glass-field' },
      React.createElement('span', null, 'Base URL'),
      React.createElement('input', {
        value: baseUrl,
        disabled: currentModel?.custom === true,
        placeholder: 'https://...',
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setBaseUrl(event.currentTarget.value),
      }),
    ),
    currentModel?.custom && React.createElement('div', { className: 'field-hint' }, '自定义模型的 baseUrl 来自 .microcode/config.json'),
    React.createElement('button', {
      className: 'liquid-button primary',
      onClick: () => void window.microcode.setApiConfig({
        modelKey,
        apiKey: apiKey || undefined,
        baseUrl: currentModel?.custom ? undefined : baseUrl,
      }),
    }, '应用配置'),
  )
}

function Sidebar({ view, snapshot, setView, onToggleCollapse }: {
  view: View
  snapshot?: GuiRuntimeSnapshot
  setView: (view: View) => void
  onToggleCollapse: () => void
}) {
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
        : snapshot.agents.map((agent) =>
            React.createElement('div', { className: 'side-row', key: agent.task.id },
              React.createElement('span', { className: cx('status-dot', agent.task.status) }),
              React.createElement('div', { className: 'side-row-main' },
                React.createElement('strong', null, agent.task.description || agent.identity.name || agent.identity.id),
                React.createElement('span', null, agent.activity || agent.task.status),
              ),
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
      React.createElement('div', { className: 'panel-title' }, 'Tasks'),
      snapshot.tasks.length === 0
        ? React.createElement('div', { className: 'empty' }, 'Task lists will appear here.')
        : snapshot.tasks.map((task) =>
            React.createElement('div', { className: 'task-group', key: task.id },
              React.createElement(FileText, { size: 15 }),
              React.createElement('div', { className: 'side-row-main' },
                React.createElement('strong', null, task.title),
                React.createElement('span', null, `${task.tasks.length} items`),
                task.tasks.map((item) =>
                  React.createElement('label', { className: cx('task-row', item.completed && 'completed'), key: item.id },
                    React.createElement('input', {
                      type: 'checkbox',
                      checked: item.reminder === true,
                      disabled: item.completed,
                      onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                        void window.microcode.remindTask(task.id, item.id, event.currentTarget.checked),
                    }),
                    React.createElement('span', null, item.content),
                  ),
                ),
              ),
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

function MessageItem({ item }: { item: Extract<GuiChatItem, { kind: 'message' }> }) {
  return React.createElement('article', { className: cx('chat-item', item.role) },
    React.createElement('div', { className: 'avatar' }, item.role === 'assistant' ? React.createElement(Bot, { size: 16 }) : React.createElement(MessageSquare, { size: 16 })),
    React.createElement('div', { className: 'bubble' },
      React.createElement('div', { className: 'bubble-head' },
        React.createElement('span', null, item.role === 'assistant' ? 'Microcode' : 'You'),
        item.streaming && React.createElement('span', { className: 'streaming' }, 'streaming'),
      ),
      item.blocks.length === 0
        ? React.createElement('div', { className: 'muted' }, '...')
        : item.blocks.map((block, index) => {
            if (block.type === 'thinking') {
              return React.createElement('div', { className: 'thinking-block', key: index },
                React.createElement('div', { className: 'thinking-label' }, React.createElement(Sparkles, { size: 14 }), 'thinking'),
                React.createElement('pre', null, block.thinking),
              )
            }
            if (block.type === 'image') {
              return React.createElement('div', { className: 'image-pill', key: index }, block.label)
            }
            return React.createElement(Markdown, { key: index, text: block.text })
          }),
      item.errorMessage && React.createElement('div', { className: 'error-line' }, item.errorMessage),
    ),
  )
}

function ToolItem({ item }: { item: GuiToolItem }) {
  const output = item.output?.trim()
  const isBash = item.toolName.toLowerCase().includes('bash')
  const isFile = /file|edit|write|read/i.test(item.toolName)
  return React.createElement('article', { className: cx('tool-item', item.status) },
    React.createElement('div', { className: 'tool-icon' }, isBash ? React.createElement(Terminal, { size: 16 }) : isFile ? React.createElement(FileText, { size: 16 }) : React.createElement(Cpu, { size: 16 })),
    React.createElement('div', { className: 'tool-body' },
      React.createElement('div', { className: 'tool-head' },
        React.createElement('strong', null, item.toolName),
        React.createElement('span', { className: cx('tool-status', item.status) }, item.status),
        item.elapsedMs !== undefined && React.createElement('span', { className: 'tool-time' }, `${(item.elapsedMs / 1000).toFixed(1)}s`),
      ),
      React.createElement('div', { className: 'tool-args' }, textFromArgs(item.args)),
      output && React.createElement('pre', { className: 'tool-output' }, output),
    ),
  )
}

function PermissionItem({ item, snapshot }: { item: GuiPermissionItem; snapshot?: GuiRuntimeSnapshot }) {
  const activeQuestion = snapshot?.activeQuestion?.id === item.requestId ? snapshot.activeQuestion : undefined
  const [answers, setAnswers] = useState<Record<string, string>>({})
  return React.createElement('article', { className: cx('permission-item', item.status) },
    React.createElement('div', { className: 'permission-head' },
      React.createElement(HelpCircle, { size: 16 }),
      React.createElement('strong', null, item.requestKind === 'question' ? 'Question' : 'Permission requested'),
      React.createElement('span', null, item.toolName),
    ),
    React.createElement('div', { className: 'permission-desc' }, item.description || textFromArgs(item.input)),
    activeQuestion && activeQuestion.questions.map((question) =>
      React.createElement('div', { className: 'question-block', key: question.question },
        React.createElement('label', null, question.header),
        React.createElement('div', { className: 'question-text' }, question.question),
        React.createElement('div', { className: 'question-options' },
          question.options.map((option) =>
            React.createElement('button', {
              key: option.label,
              className: cx('option-button', answers[question.question] === option.label && 'selected'),
              onClick: () => setAnswers((prev) => ({ ...prev, [question.question]: option.label })),
            },
              React.createElement('strong', null, option.label),
              React.createElement('span', null, option.description),
            ),
          ),
        ),
        React.createElement('input', {
          className: 'other-input',
          placeholder: 'Other answer',
          value: answers[question.question] && !question.options.some((o) => o.label === answers[question.question]) ? answers[question.question] : '',
          onChange: (event) => setAnswers((prev) => ({ ...prev, [question.question]: event.currentTarget.value })),
        }),
      ),
    ),
    item.status === 'pending' && (
      activeQuestion
        ? React.createElement('div', { className: 'permission-actions' },
            React.createElement('button', { className: 'primary', onClick: () => void window.microcode.answerQuestion(item.requestId, answers) }, React.createElement(Check, { size: 15 }), 'Answer'),
            React.createElement('button', { onClick: () => void window.microcode.answerQuestion(item.requestId, {}, true) }, React.createElement(X, { size: 15 }), 'Block'),
          )
        : React.createElement('div', { className: 'permission-actions' },
            React.createElement('button', { className: 'primary', onClick: () => void window.microcode.answerPermission(item.requestId, 'allow') }, React.createElement(Check, { size: 15 }), 'Allow'),
            React.createElement('button', { onClick: () => void window.microcode.answerPermission(item.requestId, 'allow-session') }, React.createElement(Play, { size: 15 }), 'Allow session'),
            React.createElement('button', { className: 'danger', onClick: () => void window.microcode.answerPermission(item.requestId, 'deny') }, React.createElement(X, { size: 15 }), 'Deny'),
          )
    ),
  )
}

function NoticeItem({ item }: { item: Extract<GuiChatItem, { kind: 'notice' }> }) {
  return React.createElement('div', { className: cx('notice-item', item.level) }, item.text)
}

function Transcript({ timeline, snapshot }: { timeline: GuiChatItem[]; snapshot?: GuiRuntimeSnapshot }) {
  const scrollRef = useRef<HTMLElement | null>(null)
  const endRef = useRef<HTMLDivElement | null>(null)
  const autoScrollRef = useRef(true)

  const scrollToBottom = () => {
    const node = scrollRef.current
    if (!node) return
    node.scrollTop = node.scrollHeight
  }

  const handleScroll = () => {
    const node = scrollRef.current
    if (!node) return
    const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight
    autoScrollRef.current = distanceFromBottom < 72
  }

  useEffect(() => {
    if (autoScrollRef.current) requestAnimationFrame(scrollToBottom)
  }, [timeline])

  return React.createElement('main', { className: 'transcript', ref: scrollRef, onScroll: handleScroll },
    timeline.length === 0 && React.createElement('div', { className: 'welcome' },
      React.createElement('h1', null, '今天有什么计划？'),
      React.createElement('div', { className: 'prompt-suggestions' },
        React.createElement('button', { onClick: () => void window.microcode.command('/model') }, '切换模型'),
        React.createElement('button', { onClick: () => void window.microcode.command('/agents') }, '查看代理'),
        React.createElement('button', { onClick: () => void window.microcode.command('/mcp') }, '检查 MCP'),
      ),
    ),
    timeline.map((item) => {
      if (item.kind === 'message') return React.createElement(MessageItem, { key: item.id, item })
      if (item.kind === 'tool') return React.createElement(ToolItem, { key: item.id, item })
      if (item.kind === 'permission') return React.createElement(PermissionItem, { key: item.id, item, snapshot })
      return React.createElement(NoticeItem, { key: item.id, item })
    }),
    React.createElement('div', { ref: endRef }),
  )
}

function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('')
  const matches = COMMANDS.filter((cmd) => cmd.includes(query.trim()))
  if (!open) return null
  return React.createElement('div', { className: 'palette-backdrop', onMouseDown: onClose },
    React.createElement('div', { className: 'palette', onMouseDown: (event: React.MouseEvent<HTMLDivElement>) => event.stopPropagation() },
      React.createElement('div', { className: 'palette-input' }, React.createElement(Search, { size: 16 }), React.createElement('input', {
        autoFocus: true,
        placeholder: 'Run command',
        value: query,
        onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQuery(event.currentTarget.value),
        onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Escape') onClose()
          if (event.key === 'Enter' && matches[0]) {
            void window.microcode.command(matches[0])
            onClose()
          }
        },
      })),
      React.createElement('div', { className: 'palette-list' },
        matches.map((cmd) => React.createElement('button', {
          key: cmd,
          onClick: () => {
            void window.microcode.command(cmd)
            onClose()
          },
        }, React.createElement(ChevronRight, { size: 15 }), cmd)),
      ),
    ),
  )
}

function Composer({ busy, snapshot }: { busy: boolean; snapshot?: GuiRuntimeSnapshot }) {
  const [text, setText] = useState('')
  const [suggestionsOpen, setSuggestionsOpen] = useState(false)
  const [attachOpen, setAttachOpen] = useState(false)
  const [attachments, setAttachments] = useState<string[]>([])
  const [localBusy, setLocalBusy] = useState(false)
  const matches = text.startsWith('/') ? COMMANDS.filter((cmd) => cmd.startsWith(text.trim())) : []
  const effectiveBusy = busy || localBusy
  const currentModel = snapshot?.models.find((model) => model.current)
  useEffect(() => {
    if (!busy) setLocalBusy(false)
  }, [busy])
  const submit = () => {
    const value = text.trim()
    if (!value && attachments.length === 0) return
    setText('')
    const imagePaths = attachments
    setAttachments([])
    setSuggestionsOpen(false)
    setLocalBusy(true)
    if (value.startsWith('/')) void window.microcode.command(value).finally(() => setLocalBusy(false))
    else void window.microcode.prompt({ text: value, imagePaths }).finally(() => setLocalBusy(false))
  }
  const pickImages = async () => {
    setAttachOpen(false)
    if (!currentModel?.vision) {
      window.alert('当前模型不支持图片输入，请先切换到多模态模型。')
      return
    }
    const paths = await window.microcode.pickImages()
    if (paths.length > 0) setAttachments((prev) => [...prev, ...paths])
  }
  return React.createElement('div', { className: 'composer-wrap' },
    suggestionsOpen && matches.length > 0 && React.createElement('div', { className: 'slash-menu' },
      matches.map((cmd) => React.createElement('button', {
        key: cmd,
        onClick: () => {
          setText(cmd)
          setSuggestionsOpen(false)
        },
      }, cmd)),
    ),
    attachOpen && React.createElement('div', { className: 'attach-menu' },
      React.createElement('button', { onClick: pickImages }, '上传图片'),
      React.createElement('button', {
        onClick: () => {
          setAttachOpen(false)
          window.alert('文件上传即将支持。')
        },
      }, '上传文件'),
    ),
    attachments.length > 0 && React.createElement('div', { className: 'attachment-strip' },
      attachments.map((path) => React.createElement('button', {
        key: path,
        onClick: () => setAttachments((prev) => prev.filter((item) => item !== path)),
        title: 'Click to remove',
      }, path.split(/[\\/]/).at(-1) ?? path)),
    ),
    React.createElement('div', { className: cx('composer', text.trimStart().startsWith('!') && 'shell-mode') },
      React.createElement('button', {
        className: 'composer-plus',
        title: 'Attach',
        onClick: () => setAttachOpen((open) => !open),
      }, '+'),
      React.createElement('textarea', {
        value: text,
        placeholder: '有问题，尽管问',
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => {
          setText(event.currentTarget.value)
          setSuggestionsOpen(event.currentTarget.value.startsWith('/'))
        },
        onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
          if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') submit()
          if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        },
      }),
      React.createElement('div', { className: 'composer-actions' },
        effectiveBusy
          ? React.createElement('button', {
              className: 'icon-button loading',
              title: 'Stop',
              onClick: () => {
                setLocalBusy(false)
                void window.microcode.abort()
              },
            }, React.createElement('span', { className: 'spinner' }))
          : React.createElement('button', { className: 'icon-button primary send-button', title: 'Send', onClick: submit }, React.createElement(Send, { size: 18 })),
      ),
    ),
  )
}

function StatusBar({ snapshot }: { snapshot?: GuiRuntimeSnapshot }) {
  if (!snapshot) return React.createElement('footer', { className: 'statusbar' }, 'Starting Microcode...')
  return React.createElement('footer', { className: 'statusbar' },
    React.createElement('span', null, snapshot.cwd),
    React.createElement('span', null, snapshot.agent.model.id),
    React.createElement('span', null, snapshot.agent.thinkingLevel),
    React.createElement('span', null, snapshot.agent.permission.mode),
    React.createElement('span', null, `${snapshot.agent.tokens.context.percentUsed}% context`),
    React.createElement('span', null, `${snapshot.runningWorkers}/${snapshot.maxWorkers} agents`),
  )
}

function App() {
  const [view, setView] = useState<View>('chat')
  const [timeline, setTimeline] = useState<GuiChatItem[]>([])
  const [snapshot, setSnapshot] = useState<GuiRuntimeSnapshot>()
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  useEffect(() => {
    const off = window.microcode.onEvent((event: GuiIpcEvent) => {
      if (event.type === 'timeline') setTimeline(event.timeline)
      if (event.type === 'snapshot') setSnapshot(event.snapshot)
      if (event.type === 'ready') {
        setSnapshot(event.snapshot)
        setTimeline(event.timeline)
      }
    })
    window.microcode.start().then(({ snapshot, timeline }) => {
      setSnapshot(snapshot)
      setTimeline(timeline)
    }).catch((error) => {
      setTimeline([{
        id: 'startup-error',
        kind: 'notice',
        level: 'error',
        text: error instanceof Error ? error.message : String(error),
        createdAt: Date.now(),
      }])
    })
    const keyHandler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.shiftKey && event.key.toLowerCase() === 'p') {
        event.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', keyHandler)
    return () => {
      off()
      window.removeEventListener('keydown', keyHandler)
    }
  }, [])

  return React.createElement('div', { className: cx('app-shell', sidebarCollapsed && 'sidebar-collapsed') },
    React.createElement('nav', { className: 'activitybar' },
      React.createElement('div', { className: 'activity-top' },
        React.createElement(ActivityButton, { active: view === 'chat', label: 'Chat', icon: React.createElement(MessageSquare, { size: 21 }), onClick: () => setView('chat') }),
        React.createElement(ActivityButton, { active: view === 'sessions', label: 'Sessions', icon: React.createElement(PanelLeft, { size: 21 }), onClick: () => setView('sessions') }),
        React.createElement(ActivityButton, { active: view === 'agents', label: 'Agents', icon: React.createElement(Workflow, { size: 21 }), onClick: () => setView('agents') }),
        React.createElement(ActivityButton, { active: view === 'tasks', label: 'Tasks', icon: React.createElement(GitBranch, { size: 21 }), onClick: () => setView('tasks') }),
        React.createElement(ActivityButton, { active: view === 'mcp', label: 'MCP', icon: React.createElement(Server, { size: 21 }), onClick: () => setView('mcp') }),
      ),
      React.createElement('div', { className: 'activity-bottom' },
        React.createElement(ActivityButton, { active: false, label: 'Command Palette', icon: React.createElement(Search, { size: 21 }), onClick: () => setPaletteOpen(true) }),
        React.createElement(ActivityButton, { active: view === 'settings', label: 'Settings', icon: React.createElement(Settings, { size: 21 }), onClick: () => setView('settings') }),
      ),
    ),
    !sidebarCollapsed && React.createElement(Sidebar, {
      view,
      snapshot,
      setView,
      onToggleCollapse: () => setSidebarCollapsed(true),
    }),
    React.createElement('section', { className: cx('workbench', timeline.length === 0 && 'empty-state') },
      sidebarCollapsed && React.createElement('button', {
        className: 'sidebar-restore',
        title: '展开侧边栏',
        onClick: () => setSidebarCollapsed(false),
      }, React.createElement(PanelLeft, { size: 18 })),
      React.createElement('header', { className: 'titlebar' },
        React.createElement('div', null,
          React.createElement('strong', null, 'Microcode'),
          React.createElement('span', null, snapshot?.sessionTitle || snapshot?.sessionId?.slice(0, 8) || 'New session'),
        ),
        React.createElement('button', { className: 'small-button', onClick: () => setPaletteOpen(true) }, React.createElement(Search, { size: 15 }), 'Commands'),
      ),
      React.createElement(Transcript, { timeline, snapshot }),
      React.createElement(Composer, { busy: Boolean(snapshot?.busy), snapshot }),
      React.createElement(StatusBar, { snapshot }),
    ),
    React.createElement(CommandPalette, { open: paletteOpen, onClose: () => setPaletteOpen(false) }),
  )
}

const root = createRoot(document.getElementById('root')!)
root.render(React.createElement(App))
