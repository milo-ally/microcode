import {
  type Component,
  truncateToWidth,
  visibleWidth,
} from '@earendil-works/pi-tui'
import chalk from 'chalk'
import type { AgentSupervisor } from '../../swarm/index.ts'

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
      for (const { task, activity } of states.slice(-8)) {
        lines.push(borderLine(
          `${icon(task.status)} ${task.description}`,
          width,
        ))
        if (
          activity &&
          (task.status === 'running' || task.status === 'waiting_permission')
        ) {
          lines.push(chalk.hex('#777777')(borderLine(`  ${activity}`, width)))
        }
      }
    }
    lines.push(chalk.hex('#666666')(`└${'─'.repeat(innerWidth)}┘`))
    return lines
  }
}
