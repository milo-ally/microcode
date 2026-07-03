import React, { useEffect, useState } from 'react'
import {
  GitBranch,
  MessageSquare,
  PanelLeft,
  Search,
  Server,
  Settings,
  Workflow,
} from 'lucide-react'
import { ActivityButton } from '../components/ActivityButton.ts'
import { CommandPalette } from '../features/command-palette/CommandPalette.ts'
import { Composer } from '../features/composer/Composer.ts'
import { Transcript } from '../features/timeline/Transcript.ts'
import { Sidebar } from '../layout/Sidebar.ts'
import { StatusBar } from '../layout/StatusBar.ts'
import { cx } from '../lib/cx.ts'
import type { View } from './viewTypes.ts'
import type {
  GuiChatItem,
  GuiIpcEvent,
  GuiRuntimeSnapshot,
} from '../../shared/types.ts'

export function App() {
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
    React.createElement(Sidebar, {
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
