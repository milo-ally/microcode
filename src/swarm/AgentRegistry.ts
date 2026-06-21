import type { MicrocodeAgent } from '../agent/index.ts'

export class AgentRegistry {
  private readonly agents = new Map<string, MicrocodeAgent>()

  register(agent: MicrocodeAgent): void {
    const id = agent.getId()
    if (this.agents.has(id)) {
      throw new Error(`Agent already registered: ${id}`)
    }
    this.agents.set(id, agent)
  }

  get(agentId: string): MicrocodeAgent | undefined {
    return this.agents.get(agentId)
  }

  list(): readonly MicrocodeAgent[] {
    return [...this.agents.values()]
  }

  remove(agentId: string): boolean {
    return this.agents.delete(agentId)
  }
}
