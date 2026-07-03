import React from 'react'
import { Check, HelpCircle, Play, X } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import { textFromArgs } from '../../lib/format.ts'
import type { GuiPermissionItem, GuiRuntimeSnapshot } from '../../../shared/types.ts'
import { QuestionPermissionItem } from './QuestionPermissionItem.ts'

export function PermissionItem({ item, snapshot }: { item: GuiPermissionItem; snapshot?: GuiRuntimeSnapshot }) {
  const activeQuestion = snapshot?.activeQuestion?.id === item.requestId ? snapshot.activeQuestion : undefined
  if (activeQuestion) {
    return React.createElement(QuestionPermissionItem, { item, activeQuestion })
  }

  return React.createElement('article', { className: cx('permission-item', item.status) },
    React.createElement('div', { className: 'permission-head' },
      React.createElement(HelpCircle, { size: 16 }),
      React.createElement('strong', null, item.requestKind === 'question' ? 'Question' : 'Permission requested'),
      React.createElement('span', null, item.toolName),
    ),
    React.createElement('div', { className: 'permission-desc' }, item.description || textFromArgs(item.input)),
    item.status === 'pending' && (
      React.createElement('div', { className: 'permission-actions' },
        React.createElement('button', { className: 'primary', onClick: () => void window.microcode.answerPermission(item.requestId, 'allow') }, React.createElement(Check, { size: 15 }), 'Allow'),
        React.createElement('button', { onClick: () => void window.microcode.answerPermission(item.requestId, 'allow-session') }, React.createElement(Play, { size: 15 }), 'Allow session'),
        React.createElement('button', { className: 'danger', onClick: () => void window.microcode.answerPermission(item.requestId, 'deny') }, React.createElement(X, { size: 15 }), 'Deny'),
      )
    ),
  )
}
