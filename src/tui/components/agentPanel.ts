import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui'
import chalk from 'chalk'
import type { AgentSupervisor, AgentRuntimeState } from '../../swarm/index.ts'

const ACTIVE_STATUSES = new Set(['queued', 'running', 'waiting_permission'])
const MAX_TERMINAL = 3

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

function borderLine(content: string, width: number): string {
  const available = Math.max(1, width - 4)
  const value = truncateToWidth(content, available, '…')
  return `│ ${value}${' '.repeat(Math.max(0, available - visibleWidth(value)))} │`
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

export class AgentPanel implements Component {
  constructor(private readonly supervisor: AgentSupervisor) {}

  invalidate(): void {}

  render(width: number): string[] {
    const states = this.supervisor.listAgents()
    const innerWidth = Math.max(1, width - 2)
    const lines = [
      chalk.hex('#666666')(`┌${'─'.repeat(innerWidth)}┐`),
      chalk.hex('#00d7ff')(borderLine(
        `Agents ${this.supervisor.getRunningCount()}/${this.supervisor.getMaxWorkers()}`,
        width,
      )),
    ]

    if (states.length === 0) {
      lines.push(chalk.hex('#777777')(borderLine('No delegated work', width)))
    } else {
      const { active, terminal } = partition(states)

      for (const { task, activity } of active) {
        lines.push(borderLine(`${icon(task.status)} ${task.description}`, width))
        if (activity && (task.status === 'running' || task.status === 'waiting_permission')) {
          lines.push(chalk.hex('#777777')(borderLine(`  ${activity}`, width)))
        }
      }

      if (terminal.length > 0) {
        const shown = terminal
          .sort((a, b) => (b.task.completedAt ?? 0) - (a.task.completedAt ?? 0))
          .slice(0, MAX_TERMINAL)
        for (const { task } of shown) {
          lines.push(chalk.hex('#666666')(borderLine(`${icon(task.status)} ${task.description}`, width)))
        }

        const hidden = terminal.length - shown.length
        if (hidden > 0) {
          lines.push(chalk.hex('#555555')(borderLine(`…and ${hidden} more completed`, width)))
        }
      }
    }

    lines.push(chalk.hex('#666666')(`└${'─'.repeat(innerWidth)}┘`))
    return lines
  }
}
