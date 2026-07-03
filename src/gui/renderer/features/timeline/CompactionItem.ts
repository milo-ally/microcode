import React from 'react'
import { CheckCircle2, Loader2, XCircle } from 'lucide-react'
import { cx } from '../../lib/cx.ts'
import type { GuiChatItem } from '../../../shared/types.ts'

function formatTokens(value: number | undefined): string {
  if (value === undefined) return '-'
  return value.toLocaleString('en-US')
}

function formatElapsed(value: number | undefined): string | undefined {
  if (value === undefined) return undefined
  return `${(value / 1000).toFixed(1)}s`
}

export function CompactionItem({ item }: { item: Extract<GuiChatItem, { kind: 'compaction' }> }) {
  const failed = item.phase === 'done' && item.message.startsWith('Compaction failed')
  const done = item.phase === 'done' && !failed
  const units = item.totalUnits !== undefined && item.processedUnits !== undefined
    ? `${item.processedUnits}/${item.totalUnits} units`
    : undefined
  const elapsed = formatElapsed(item.elapsedMs)
  const meta = [units, elapsed].filter(Boolean).join(' · ')

  return React.createElement('div', { className: cx('compaction-item', done && 'done', failed && 'failed') },
    React.createElement('div', { className: 'compaction-head' },
      React.createElement('div', { className: 'compaction-title' },
        failed
          ? React.createElement(XCircle, { size: 16 })
          : done
            ? React.createElement(CheckCircle2, { size: 16 })
            : React.createElement(Loader2, { className: 'spin', size: 16 }),
        React.createElement('strong', null, done ? 'Context compacted' : failed ? 'Compaction failed' : 'Compacting context'),
      ),
      React.createElement('span', null, `${Math.round(item.progress)}%`),
    ),
    React.createElement('div', { className: cx('compaction-bar', !done && !failed && 'active') },
      React.createElement('span', { style: { width: `${item.progress}%` } }),
    ),
    React.createElement('div', { className: 'compaction-message' }, item.message),
    React.createElement('div', { className: 'compaction-meta' },
      React.createElement('span', null, item.tokensAfter === undefined
        ? `${formatTokens(item.tokensBefore)} tokens before`
        : `${formatTokens(item.tokensBefore)} -> ${formatTokens(item.tokensAfter)} tokens`),
      meta && React.createElement('span', null, meta),
    ),
  )
}
