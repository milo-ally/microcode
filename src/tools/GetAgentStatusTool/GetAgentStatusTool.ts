import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'get_agent_status'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'allow'

const statusSchema = Type.Object({
  agent_id: Type.Optional(Type.String()),
}, { additionalProperties: false })

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: 'text', text }], details }
}

export function createGetAgentStatusTool(
  supervisor: AgentSupervisor,
  _coordinatorId: string,
): AgentTool<typeof statusSchema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Agent status',
    description: 'List worker status. Do not poll; completion notifications arrive automatically.',
    parameters: statusSchema,
    async execute(_id, input: Static<typeof statusSchema>) {
      const states = supervisor.listAgents().filter(
        (state) => !input.agent_id || state.task.agentId === input.agent_id,
      )
      const lines = states.length === 0
        ? ['No matching agents.']
        : states.map(({ task, activity }) =>
            `${task.agentId} ${task.status} ${task.description}${activity ? ` — ${activity}` : ''}`
          )
      return textResult(lines.join('\n'), { agents: states })
    },
  }
}
