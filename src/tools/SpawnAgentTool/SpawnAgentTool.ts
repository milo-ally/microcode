import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'spawn'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'ask'

const spawnSchema = Type.Object({
  description: Type.String({ description: 'Short worker task description.' }),
  prompt: Type.String({ description: 'Complete, self-contained worker instructions.' }),
  role: Type.Optional(Type.String({ description: 'Worker role, such as researcher or implementer.' })),
  tools: Type.Optional(Type.Array(Type.String(), {
    
    description: 'Tool names to grant the worker. If omitted, defaults to the standard read/write coding tools.',
  })),
}, { additionalProperties: false })

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: 'text', text }], details }
}

export function createSpawnAgentTool(
  supervisor: AgentSupervisor,
  coordinatorId: string,
): AgentTool<typeof spawnSchema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Spawn agent',
    description:
      'Launch a new asynchronous worker in its own Git worktree. Set tools to control which tools the worker can use. Workers always run in auto-approve mode.',
    parameters: spawnSchema,
    async execute(
      _id: string,
      input: Static<typeof spawnSchema>,
      _signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<unknown>) => void,
    ) {
      onUpdate?.({
        content: [{ type: 'text', text: `Launching agent: ${input.description}` }],
        details: { description: input.description },
      })
      const task = await supervisor.spawn({
        parentAgentId: coordinatorId,
        description: input.description,
        prompt: input.prompt,
        role: input.role,
        tools: input.tools,
      })
      return textResult(
        `Launched ${task.agentId} for "${task.description}" (${task.status}) in batch ${task.batchId}. ` +
        `After launching the rest of this batch, call worktree with action="wait" and batch_id="${task.batchId}" once. Do not poll list or status.`,
        task,
      )
    },
  }
}
