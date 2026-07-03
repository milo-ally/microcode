import React from 'react'
import { Globe } from 'lucide-react'
import { getDetailString, joinParts, MetricRow, OutputBlock, preview, ToolFrame } from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function WebSearchToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const query = getDetailString(item.details, 'query') ?? (typeof item.args.query === 'string' ? item.args.query : '')
  const results = Array.isArray(item.details?.results) ? item.details.results as Array<Record<string, unknown>> : []
  const output = results.map((result, index) => {
    const title = typeof result.title === 'string' ? result.title : `Result ${index + 1}`
    const url = typeof result.url === 'string' ? result.url : ''
    return joinParts([`${index + 1}. ${title}`, url])
  }).join('\n')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Globe, { size: 16 }),
    title: 'WebSearch',
    subtitle: query ? `"${preview(query, 96)}"` : 'web search',
    expanded,
    onToggleExpanded,
  },
    React.createElement(MetricRow, { parts: [results.length > 0 ? `${results.length} results` : undefined] }),
    output && React.createElement(OutputBlock, { item, output, expanded, onToggleExpanded, label: 'Results' }),
  )
}

