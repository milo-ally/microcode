import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'message'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'allow'

const sendSchema = Type.Object({
  agent_id: Type.String(),
  message: Type.String(),
}, { additionalProperties: false })

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: 'text', text }], details }
}

export function createSendAgentMessageTool(
  supervisor: AgentSupervisor,
  _coordinatorId: string,
): AgentTool<typeof sendSchema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Message agent',
    description: 'Wake up an existing worker agent and send a follow-up instruction to it. ',
    parameters: sendSchema,
    async execute(_id, input: Static<typeof sendSchema>) {
      await supervisor.send(input.agent_id, input.message)
      return textResult(`Message sent to ${input.agent_id}.`, { agentId: input.agent_id })
    },
  }
}
