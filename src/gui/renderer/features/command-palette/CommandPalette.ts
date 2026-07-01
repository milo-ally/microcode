import React, { useState } from 'react'
import { ChevronRight, Search } from 'lucide-react'
import { COMMANDS } from '../../commands/catalog.ts'

export function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
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
