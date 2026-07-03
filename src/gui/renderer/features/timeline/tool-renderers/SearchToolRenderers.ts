import React from 'react'
import { FileSearch, Globe, Search } from 'lucide-react'
import {
  getDetailNumber,
  getDetailString,
  joinParts,
  MetricRow,
  OutputBlock,
  preview,
  ToolFrame,
} from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function GrepToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const pattern = typeof item.args.pattern === 'string' ? item.args.pattern : ''
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FileSearch, { size: 16 }),
    title: 'grep',
    subtitle: pattern ? `/${preview(pattern, 90)}/` : 'content search',
  },
    React.createElement(MetricRow, {
      parts: [
        numberMetric(item.details, 'numMatches', 'matches'),
        numberMetric(item.details, 'numFiles', 'files'),
        numberMetric(item.details, 'numLines', 'lines'),
        item.details?.truncated === true ? 'truncated' : undefined,
      ],
    }),
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}

export function GlobToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const pattern = typeof item.args.pattern === 'string' ? item.args.pattern : ''
  const filenames = Array.isArray(item.details?.filenames) ? item.details.filenames as string[] : []
  const output = filenames.slice(0, expanded ? 200 : 16).join('\n')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Search, { size: 16 }),
    title: 'glob',
    subtitle: pattern || 'file search',
  },
    React.createElement(MetricRow, {
      parts: [
        numberMetric(item.details, 'numFiles', 'files'),
        item.details?.truncated === true ? 'truncated' : undefined,
      ],
    }),
    output && React.createElement(OutputBlock, { item, output, expanded, onToggleExpanded, label: 'Files' }),
  )
}

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
  },
    React.createElement(MetricRow, { parts: [results.length > 0 ? `${results.length} results` : undefined] }),
    output && React.createElement(OutputBlock, { item, output, expanded, onToggleExpanded, label: 'Results' }),
  )
}

export function WebFetchToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const url = getDetailString(item.details, 'finalUrl') ?? getDetailString(item.details, 'url') ?? (typeof item.args.url === 'string' ? item.args.url : '')
  const code = getDetailNumber(item.details, 'code')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(Globe, { size: 16 }),
    title: 'WebFetch',
    subtitle: preview(url, 100) || 'web page',
  },
    React.createElement(MetricRow, {
      parts: [
        code !== undefined ? `HTTP ${code}` : undefined,
        getDetailString(item.details, 'contentType'),
        numberMetric(item.details, 'bytes', 'bytes'),
        item.details?.truncated === true ? 'truncated' : undefined,
      ],
    }),
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}

function numberMetric(details: Record<string, unknown> | undefined, key: string, noun: string): string | undefined {
  const value = getDetailNumber(details, key)
  return value === undefined ? undefined : `${value.toLocaleString()} ${noun}`
}

