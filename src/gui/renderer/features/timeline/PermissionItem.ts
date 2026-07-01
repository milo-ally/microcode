import React, { useState } from 'react'
import { Check, HelpCircle, Play, X } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import { textFromArgs } from '../../lib/format.ts'
import type { GuiPermissionItem, GuiRuntimeSnapshot } from '../../../shared/types.ts'

export function PermissionItem({ item, snapshot }: { item: GuiPermissionItem; snapshot?: GuiRuntimeSnapshot }) {
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
