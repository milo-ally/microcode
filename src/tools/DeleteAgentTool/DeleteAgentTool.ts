import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'delete'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'ask'

const deleteSchema = Type.Object({
  agent_id: Type.String({ description: 'ID of the agent to permanently delete.' }),
}, { additionalProperties: false })

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: 'text', text }], details }
}

export function createDeleteAgentTool(
  supervisor: AgentSupervisor,
  _coordinatorId: string,
): AgentTool<typeof deleteSchema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Delete agent',
    description: 'Permanently delete a delegated agent — stops it, removes its worktree, and erases all records.',
    parameters: deleteSchema,
    async execute(_id, input: Static<typeof deleteSchema>) {
      await supervisor.delete(input.agent_id)
      return textResult(
        `Permanently deleted agent ${input.agent_id} and all its traces.`,
        { agentId: input.agent_id },
      )
    },
  }
}
