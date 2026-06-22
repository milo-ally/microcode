import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'stop'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'allow'

const stopSchema = Type.Object({
  agent_id: Type.String(),
}, { additionalProperties: false })

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: 'text', text }], details }
}

export function createStopAgentTool(
  supervisor: AgentSupervisor,
  _coordinatorId: string,
): AgentTool<typeof stopSchema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Stop agent',
    description: 'Stop a queued or running worker.',
    parameters: stopSchema,
    async execute(_id, input: Static<typeof stopSchema>) {
      await supervisor.stop(input.agent_id)
      return textResult(`Stopped ${input.agent_id}.`, { agentId: input.agent_id })
    },
  }
}
