import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'status'
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
  let lastCall = 0

  return {
    name: TOOL_NAME,
    label: 'Agent status',
    description:
      'ONE-TIME check of worker status. Results arrive automatically when agents complete — ' +
      'you do NOT need to poll. Calling this repeatedly will return an error.',
    parameters: statusSchema,
    async execute(_id, input: Static<typeof statusSchema>) {
      // Rate-limit: refuse calls within 5 seconds of each other
      const now = Date.now()
      if (now - lastCall < 5000) {
        return {
          content: [{
            type: 'text',
            text: 'Stop polling. Agent results arrive automatically when all workers finish. Do not call this tool again.',
          }],
          details: { agents: [] },
          isError: true,
        }
      }
      lastCall = now

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
