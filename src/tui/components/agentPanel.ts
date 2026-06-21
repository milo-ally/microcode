import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui'
import chalk from 'chalk'
import type { AgentSupervisor, AgentRuntimeState } from '../../swarm/index.ts'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_permission'])
const MAX_TERMINAL = 3
const TOOL_HISTORY_LIMIT = 6

function icon(status: string): string {
  switch (status) {
    case 'queued': return '○'
    case 'running': return '●'
    case 'waiting_permission': return '◐'
    case 'completed': return '✓'
    case 'failed': return '✗'
    default: return '■'
  }
}

function toolStatus(entry: { done: boolean; error: boolean }): { icon: string; fg: (s: string) => string } {
  if (!entry.done) return { icon: '●', fg: chalk.hex('#00d7ff') }
  return entry.error
    ? { icon: '✗', fg: chalk.hex('#cc0000') }
    : { icon: '✓', fg: chalk.hex('#00aa00') }
}

function fit(content: string, maxWidth: number): string {
  return truncateToWidth(content, Math.max(1, maxWidth), '…')
}

// ── border/indent helpers ──

function hdr(text: string, width: number): string {
  const inner = width - 4
  return `│ ${chalk.hex('#00d7ff')(fit(text, inner))}${' '.repeat(Math.max(0, inner - visibleWidth(text)))} │`
}

function row(text: string, width: number, fg?: (s: string) => string): string {
  const inner = width - 4
  const colored = fg ? fg(text) : text
  return `│ ${fit(colored, inner)}${' '.repeat(Math.max(0, inner - visibleWidth(text)))} │`
}

function indent(prefix: string, text: string, width: number, fg?: (s: string) => string): string {
  const inner = width - 4 - 2 // 2-char prefix indent
  const colored = fg ? fg(text) : text
  return `│ ${prefix}${fit(colored, inner)}${' '.repeat(Math.max(0, inner - visibleWidth(text)))} │`
}

// ── tree rendering ──

function renderToolTree(
  history: readonly { name: string; done: boolean; error: boolean }[],
  width: number,
): string[] {
  const lines: string[] = []
  const shown = history.slice(-TOOL_HISTORY_LIMIT)
  for (let i = 0; i < shown.length; i++) {
    const entry = shown[i]
    const prefix = i === shown.length - 1 ? ' └─ ' : ' ├─ '
    const s = toolStatus(entry)
    lines.push(indent(prefix, `${s.icon} ${entry.name}`, width, s.fg))
  }
  if (history.length > TOOL_HISTORY_LIMIT) {
    lines.push(indent('  ', chalk.hex('#555555')(`…${history.length - TOOL_HISTORY_LIMIT} more`), width))
  }
  return lines
}

function renderTerminalSummary(
  history: readonly { name: string; done: boolean; error: boolean }[],
  width: number,
): string[] {
  if (history.length === 0) return []
  const dim = chalk.hex('#666666')
  const last = history[history.length - 1]
  const s = toolStatus(last)
  const summary = history.length === 1
    ? `${s.icon} ${last.name}`
    : `${s.icon} ${last.name}  (${history.length} tools)`
  return [indent(' └─ ', summary, width, dim)]
}

function partition(states: readonly AgentRuntimeState[]): {
  active: AgentRuntimeState[]
  terminal: AgentRuntimeState[]
} {
  const active: AgentRuntimeState[] = []
  const terminal: AgentRuntimeState[] = []
  for (const state of states) {
    if (ACTIVE_STATUSES.has(state.task.status)) {
      active.push(state)
    } else {
      terminal.push(state)
    }
  }
  return { active, terminal }
}

// ── component ──

export class AgentPanel implements Component {
  constructor(private readonly supervisor: AgentSupervisor) {}

  invalidate(): void {}

  render(width: number): string[] {
    const states = this.supervisor.listAgents()
    const inner = Math.max(1, width - 2)
    const line = (s: string) => chalk.hex('#666666')(s)
    const lines: string[] = [
      line(`┌${'─'.repeat(inner)}┐`),
      hdr(`Agents ${this.supervisor.getRunningCount()}/${this.supervisor.getMaxWorkers()}`, width),
    ]

    if (states.length === 0) {
      lines.push(row('No delegated work', width, chalk.hex('#777777')))
    } else {
      const { active, terminal } = partition(states)

      for (const { task, toolHistory } of active) {
        lines.push(row(`${icon(task.status)} ${task.description}`, width))
        if (toolHistory.length > 0) {
          lines.push(...renderToolTree(toolHistory, width))
        }
      }

      if (terminal.length > 0) {
        const shown = terminal
          .sort((a, b) => (b.task.completedAt ?? 0) - (a.task.completedAt ?? 0))
          .slice(0, MAX_TERMINAL)
        for (const { task, toolHistory } of shown) {
          lines.push(row(`${icon(task.status)} ${task.description}`, width, chalk.hex('#666666')))
          if (toolHistory.length > 0) {
            lines.push(...renderTerminalSummary(toolHistory, width))
          }
        }

        const hidden = terminal.length - shown.length
        if (hidden > 0) {
          lines.push(row(`…and ${hidden} more completed`, width, chalk.hex('#555555')))
        }
      }
    }

    lines.push(line(`└${'─'.repeat(inner)}┘`))
    return lines
  }
}
