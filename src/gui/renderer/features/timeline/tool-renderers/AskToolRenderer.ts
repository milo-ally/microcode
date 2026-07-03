import React from 'react'
import { CircleHelp } from 'lucide-react'
import { MetricRow, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function AskToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const questions = Array.isArray(item.details?.questions)
    ? item.details.questions as any[]
    : Array.isArray(item.args.questions)
      ? item.args.questions as any[]
      : []
  const answers = item.details?.answers && typeof item.details.answers === 'object'
    ? item.details.answers as Record<string, unknown>
    : undefined
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(CircleHelp, { size: 16 }),
    title: 'Ask',
    subtitle: questions[0]?.question ? preview(String(questions[0].question), 110) : 'user question',
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, {
      parts: [
        questions.length > 0 ? `${questions.length} questions` : undefined,
        answers ? `${Object.keys(answers).length} answers` : undefined,
      ],
    }),
  )
}

