import React, { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cx } from '../lib/cx.ts'

export type SelectOption = {
  value: string
  label: string
  meta?: string
  missing?: boolean
}

export function GlassSelect({ value, options, onChange, ariaLabel }: {
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
