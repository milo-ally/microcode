import React from 'react'
import { cx } from '../lib/cx.ts'

export function ActivityButton(props: {
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
