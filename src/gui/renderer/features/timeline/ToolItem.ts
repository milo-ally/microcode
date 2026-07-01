import React from 'react'
import { Cpu, FileText, Terminal } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import { textFromArgs } from '../../lib/format.ts'
import type { GuiToolItem } from '../../../shared/types.ts'

export function ToolItem({ item }: { item: GuiToolItem }) {
  const output = item.output ?? ''
  const hasOutput = output.trim().length > 0
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
      (item.status === 'running' || hasOutput) && React.createElement('div', { className: 'tool-stream' },
        React.createElement('div', { className: 'tool-stream-head' },
          item.status === 'running' && React.createElement('span', { className: 'live-dot' }),
          React.createElement('span', null, item.status === 'running' ? 'Live output' : 'Output'),
        ),
        hasOutput
          ? React.createElement('pre', { className: 'tool-output' }, output)
          : React.createElement('div', { className: 'tool-output empty-output' }, 'Waiting for output...'),
      ),
    ),
  )
}
