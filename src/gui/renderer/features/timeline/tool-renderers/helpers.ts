import React from 'react'
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  ChevronDown,
  Cpu,
  FileText,
  Globe,
  ListChecks,
  Search,
  Terminal,
} from 'lucide-react'
import { textFromArgs } from '../../../lib/format.ts'
import type { GuiToolItem } from '../../../../shared/types.ts'

const LIVE_OUTPUT_LINES = 12
const COMPLETED_OUTPUT_LINES = 14
const EXPANDED_OUTPUT_LINES = 240

export function shortPath(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  return value.split('/').filter(Boolean).slice(-2).join('/') || value
}

export function preview(value: unknown, limit = 80): string {
  if (typeof value !== 'string') return ''
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > limit ? `${normalized.slice(0, limit - 3)}...` : normalized
}

export function numberDetail(value: unknown, noun: string): string | undefined {
  return typeof value === 'number' ? `${value.toLocaleString()} ${noun}` : undefined
}

export function formatBytes(value: unknown): string | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined
  if (value < 1024) return `${value} B`
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`
  return `${(value / 1024 / 1024).toFixed(1)} MB`
}

export function joinParts(parts: Array<string | undefined | false>): string {
  return parts.filter((part): part is string => Boolean(part)).join(' · ')
}

export function textOutput(item: GuiToolItem): string {
  return (item.output ?? '').trimEnd()
}

export function getDetailString(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const value = details?.[key]
  return typeof value === 'string' && value ? value : undefined
}

export function getDetailNumber(details: Record<string, unknown> | undefined, key: string): number | undefined {
  const value = details?.[key]
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

export function ToolFrame({
  item,
  icon,
  title,
  subtitle,
  children,
  expanded = false,
  onToggleExpanded,
}: {
  item: GuiToolItem
  icon?: React.ReactNode
  title?: string
  subtitle?: string
  children?: React.ReactNode
  expanded?: boolean
  onToggleExpanded?: () => void
}) {
  const Icon = item.status === 'complete'
    ? CircleCheck
    : item.status === 'error'
      ? CircleX
      : CircleDashed
  const elapsed = item.elapsedMs !== undefined ? `${(item.elapsedMs / 1000).toFixed(1)}s` : undefined
  const hasDetails = React.Children.count(children) > 0
  return React.createElement('article', { className: `tool-item ${item.status}${expanded ? ' expanded' : ''}` },
    React.createElement('div', { className: 'tool-icon' }, icon ?? defaultIcon(item.toolName)),
    React.createElement('div', { className: 'tool-body' },
      React.createElement('div', { className: 'tool-head' },
        React.createElement('span', { className: `tool-state-icon ${item.status}` }, React.createElement(Icon, { size: 15 })),
        React.createElement('strong', null, title ?? item.toolName),
        React.createElement('span', { className: `tool-status ${item.status}` }, item.statusText ?? item.status),
        elapsed && React.createElement('span', { className: 'tool-time' }, elapsed),
        hasDetails && onToggleExpanded && React.createElement('button', {
          className: 'tool-detail-toggle',
          onClick: onToggleExpanded,
          title: expanded ? 'Collapse details' : 'Expand details',
        }, React.createElement(ChevronDown, { size: 15 }), expanded ? 'Hide' : 'Details'),
      ),
      subtitle && React.createElement('div', { className: 'tool-subtitle' }, subtitle),
      !subtitle && React.createElement('div', { className: 'tool-args' }, textFromArgs(item.args)),
      hasDetails && React.createElement('div', {
        className: `tool-details${expanded ? ' expanded' : ''}`,
        'aria-hidden': !expanded,
      }, children),
    ),
  )
}

export function MetricRow({ parts }: { parts: Array<string | undefined | false> }) {
  const filtered = parts.filter((part): part is string => Boolean(part))
  if (filtered.length === 0) return null
  return React.createElement('div', { className: 'tool-metrics' },
    filtered.map((part, index) => React.createElement('span', { key: `${part}-${index}` }, part)),
  )
}

export function OutputBlock({
  item,
  output,
  expanded,
  onToggleExpanded,
  label = 'Output',
  preferTailWhileRunning = false,
}: {
  item: GuiToolItem
  output?: string
  expanded: boolean
  onToggleExpanded: () => void
  label?: string
  preferTailWhileRunning?: boolean
}) {
  const raw = (output ?? textOutput(item)).trimEnd()
  if (!expanded && !raw) return null
  const lines = raw ? raw.split('\n') : []
  const visible = formatVisibleLines(lines, item.status === 'running', expanded, preferTailWhileRunning)
  const canExpand = lines.length > visible.displayedLineCount
  const emptyText = item.waitingForPermission
    ? 'Waiting for permission...'
    : item.status === 'running'
      ? 'Running...'
      : 'No output.'
  return React.createElement('div', { className: 'tool-stream' },
    React.createElement('div', { className: 'tool-stream-head' },
      item.status === 'running' && React.createElement('span', { className: 'live-dot' }),
      React.createElement('span', null, item.status === 'running' ? `Live ${label.toLowerCase()}` : label),
      lines.length > 0 && React.createElement('span', { className: 'tool-line-count' }, `${lines.length.toLocaleString()} lines`),
      canExpand && React.createElement('button', { className: 'tool-toggle', onClick: onToggleExpanded },
        expanded ? 'Collapse' : 'Expand',
      ),
    ),
    raw
      ? React.createElement('pre', { className: 'tool-output' }, visible.text)
      : React.createElement('div', { className: 'tool-output empty-output' }, emptyText),
  )
}

export function AutoScrollCodeFrame({
  children,
  className,
  live,
  scrollKey,
}: {
  children?: React.ReactNode
  className: string
  live: boolean
  scrollKey: string
}) {
  const ref = React.useRef<HTMLPreElement | null>(null)

  React.useLayoutEffect(() => {
    if (!live || !ref.current) return
    const frame = ref.current
    frame.scrollTop = frame.scrollHeight
    if (typeof requestAnimationFrame !== 'function') return
    const animationFrame = requestAnimationFrame(() => {
      frame.scrollTop = frame.scrollHeight
    })
    return () => cancelAnimationFrame(animationFrame)
  }, [live, scrollKey])

  return React.createElement('pre', { className, ref }, children)
}

function formatVisibleLines(
  lines: string[],
  running: boolean,
  expanded: boolean,
  preferTailWhileRunning: boolean,
): { text: string; displayedLineCount: number } {
  if (expanded) {
    const selected = lines.slice(-EXPANDED_OUTPUT_LINES)
    const prefix = lines.length > selected.length ? [`... ${lines.length - selected.length} earlier lines omitted ...`] : []
    return { text: [...prefix, ...selected].join('\n'), displayedLineCount: selected.length }
  }
  if (running || preferTailWhileRunning) {
    const selected = lines.slice(-LIVE_OUTPUT_LINES)
    return { text: selected.join('\n'), displayedLineCount: selected.length }
  }
  if (lines.length <= COMPLETED_OUTPUT_LINES) {
    return { text: lines.join('\n'), displayedLineCount: lines.length }
  }
  const headCount = Math.ceil(COMPLETED_OUTPUT_LINES / 2)
  const tailCount = COMPLETED_OUTPUT_LINES - headCount
  const omitted = lines.length - COMPLETED_OUTPUT_LINES
  const selected = [
    ...lines.slice(0, headCount),
    `... ${omitted.toLocaleString()} lines omitted ...`,
    ...lines.slice(-tailCount),
  ]
  return { text: selected.join('\n'), displayedLineCount: COMPLETED_OUTPUT_LINES }
}

function defaultIcon(toolName: string): React.ReactNode {
  if (toolName === 'bash') return React.createElement(Terminal, { size: 16 })
  if (/read|write|edit|file/i.test(toolName)) return React.createElement(FileText, { size: 16 })
  if (/grep|glob|search/i.test(toolName)) return React.createElement(Search, { size: 16 })
  if (/web|fetch/i.test(toolName)) return React.createElement(Globe, { size: 16 })
  if (/task/i.test(toolName)) return React.createElement(ListChecks, { size: 16 })
  return React.createElement(Cpu, { size: 16 })
}
