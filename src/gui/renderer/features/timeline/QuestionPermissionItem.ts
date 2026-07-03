import React, { useMemo, useState } from 'react'
import { Check, CheckCircle2, Circle, HelpCircle, Loader2, X } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import type { GuiPermissionItem, GuiQuestionRequest } from '../../../shared/types.ts'

export function QuestionPermissionItem({
  item,
  activeQuestion,
}: {
  item: GuiPermissionItem
  activeQuestion: GuiQuestionRequest
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState<'answer' | 'block' | null>(null)
  const unanswered = useMemo(() =>
    activeQuestion.questions.filter((question) => !answers[question.question]?.trim()),
  [activeQuestion.questions, answers])
  const ready = unanswered.length === 0

  const answer = () => {
    if (!ready || submitting) return
    setSubmitting('answer')
    void window.microcode.answerQuestion(item.requestId, answers).finally(() => setSubmitting(null))
  }

  const block = () => {
    if (submitting) return
    setSubmitting('block')
    void window.microcode.answerQuestion(item.requestId, {}, true).finally(() => setSubmitting(null))
  }

  return React.createElement('article', { className: cx('permission-item question-permission', item.status) },
    React.createElement('div', { className: 'permission-head' },
      React.createElement(HelpCircle, { size: 16 }),
      React.createElement('strong', null, 'Question'),
      React.createElement('span', null, item.toolName),
      React.createElement('span', { className: cx('question-progress', ready && 'ready') },
        `${activeQuestion.questions.length - unanswered.length}/${activeQuestion.questions.length}`,
      ),
    ),
    item.description && React.createElement('div', { className: 'permission-desc question-summary' }, item.description),
    activeQuestion.questions.map((question, index) => {
      const current = answers[question.question] ?? ''
      return React.createElement('section', { className: 'question-block', key: question.question },
        React.createElement('div', { className: 'question-kicker' },
          React.createElement('span', null, question.header || `Question ${index + 1}`),
          current.trim()
            ? React.createElement('strong', { className: 'answered' }, 'selected')
            : React.createElement('strong', null, 'required'),
        ),
        React.createElement('div', { className: 'question-text' }, question.question),
        React.createElement('div', { className: 'question-options' },
          question.options.map((option) => {
            const selected = current === option.label
            return React.createElement('button', {
              key: option.label,
              type: 'button',
              className: cx('option-button', selected && 'selected'),
              'aria-pressed': selected,
              onClick: () => setAnswers((prev) => ({ ...prev, [question.question]: option.label })),
            },
              React.createElement('span', { className: 'option-check' },
                selected ? React.createElement(CheckCircle2, { size: 18 }) : React.createElement(Circle, { size: 18 }),
              ),
              React.createElement('span', { className: 'option-copy' },
                React.createElement('strong', null, option.label),
                React.createElement('small', null, option.description),
              ),
            )
          }),
        ),
        React.createElement('input', {
          className: cx('other-input', current && !question.options.some((o) => o.label === current) && 'selected'),
          placeholder: '输入其他答案',
          value: current && !question.options.some((o) => o.label === current) ? current : '',
          onChange: (event) => {
            const value = event.currentTarget.value
            setAnswers((prev) => ({ ...prev, [question.question]: value }))
          },
          onFocus: () => {
            if (question.options.some((o) => o.label === current)) {
              setAnswers((prev) => ({ ...prev, [question.question]: '' }))
            }
          },
        }),
      )
    }),
    item.status === 'pending' && React.createElement('div', { className: 'permission-actions question-actions' },
      !ready && React.createElement('span', { className: 'question-hint' }, `还有 ${unanswered.length} 项未选择`),
      React.createElement('button', {
        className: 'primary',
        disabled: !ready || submitting !== null,
        onClick: answer,
      }, submitting === 'answer' ? React.createElement(Loader2, { size: 15, className: 'spin-icon' }) : React.createElement(Check, { size: 15 }), 'Answer'),
      React.createElement('button', {
        disabled: submitting !== null,
        onClick: block,
      }, submitting === 'block' ? React.createElement(Loader2, { size: 15, className: 'spin-icon' }) : React.createElement(X, { size: 15 }), 'Block'),
    ),
  )
}
