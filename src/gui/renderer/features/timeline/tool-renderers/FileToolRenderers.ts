import React from 'react'
import { FilePenLine, FileText, FileUp } from 'lucide-react'
import {
  formatBytes,
  getDetailNumber,
  getDetailString,
  joinParts,
  MetricRow,
  OutputBlock,
  preview,
  shortPath,
  ToolFrame,
} from './helpers.ts'
import type { ToolRendererProps } from './types.ts'

export function FileReadToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const returned = getDetailNumber(item.details, 'returnedLines')
  const total = getDetailNumber(item.details, 'totalLines')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FileText, { size: 16 }),
    title: 'read',
    subtitle: shortPath(path) || 'file',
  },
    React.createElement(MetricRow, {
      parts: [
        returned !== undefined && total !== undefined ? `${returned}/${total} lines` : undefined,
        item.details?.truncated === true ? 'truncated' : undefined,
      ],
    }),
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}

export function FileWriteToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const previewText = getDetailString(item.details, 'preview')
  const warning = getDetailString(item.details, 'warning')
  const additions = getDetailNumber(item.details, 'additions')
  const removals = getDetailNumber(item.details, 'removals')
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FileUp, { size: 16 }),
    title: 'write',
    subtitle: shortPath(path) || 'file',
  },
    React.createElement(MetricRow, {
      parts: [
        item.details?.isNewFile === true ? 'new file' : undefined,
        additions !== undefined ? `+${additions}` : undefined,
        removals !== undefined ? `-${removals}` : undefined,
        formatBytes(item.details?.bytesWritten),
        item.details?.written === false ? 'not written' : undefined,
      ],
    }),
    warning && React.createElement('div', { className: 'tool-warning' }, warning),
    previewText && React.createElement(OutputBlock, {
      item,
      output: previewText,
      expanded,
      onToggleExpanded,
      label: 'Preview',
    }),
  )
}

export function FileEditToolRenderer({ item, expanded, onToggleExpanded }: ToolRendererProps) {
  const path = getDetailString(item.details, 'path') ?? (typeof item.args.file_path === 'string' ? item.args.file_path : '')
  const additions = getDetailNumber(item.details, 'additions')
  const removals = getDetailNumber(item.details, 'removals')
  const replacements = getDetailNumber(item.details, 'replacements')
  const oldText = typeof item.args.old_string === 'string' ? preview(item.args.old_string, 72) : ''
  return React.createElement(ToolFrame, {
    item,
    icon: React.createElement(FilePenLine, { size: 16 }),
    title: 'edit',
    subtitle: shortPath(path) || oldText || 'file',
  },
    React.createElement(MetricRow, {
      parts: [
        replacements !== undefined ? `${replacements} replacements` : undefined,
        additions !== undefined ? `+${additions}` : undefined,
        removals !== undefined ? `-${removals}` : undefined,
        getDetailString(item.details, 'phase'),
      ],
    }),
    item.status === 'error' && React.createElement(OutputBlock, { item, expanded, onToggleExpanded, label: 'Error' }),
  )
}

