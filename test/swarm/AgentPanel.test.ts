import { describe, expect, test } from 'bun:test'
import { AgentPanel } from '../../src/tui/components/agentPanel.ts'

describe('AgentPanel', () => {
  test('renders an empty wide-screen summary', () => {
    const panel = new AgentPanel({
      listAgents: () => [],
      getRunningCount: () => 0,
      getMaxWorkers: () => 4,
    } as any)
    const output = panel.render(36).join('\n')
    expect(output).toContain('Agents 0/4')
    expect(output).toContain('No delegated work')
  })

  test('renders status and activity without exceeding width', () => {
    const panel = new AgentPanel({
      getRunningCount: () => 1,
      getMaxWorkers: () => 4,
      listAgents: () => [{
        task: {
          status: 'running',
          description: 'Inspect authentication implementation',
        },
        activity: 'Reading src/auth/refresh.ts',
      }],
    } as any)
    const lines = panel.render(32)
    expect(lines.join('\n')).toContain('●')
    expect(lines.every((line) => line.replace(/\x1b\[[0-9;]*m/g, '').length <= 32))
      .toBe(true)
  })
})
