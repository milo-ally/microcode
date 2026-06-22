import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'spawn'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'allow'

const spawnSchema = Type.Object({
  description: Type.String({ description: 'Short worker task description.' }),
  prompt: Type.String({ description: 'Complete, self-contained worker instructions.' }),
  role: Type.Optional(Type.String({ description: 'Worker role, such as researcher or implementer.' })),
  work_kind: Type.Optional(Type.Union([
    Type.Literal('read'),
    Type.Literal('write'),
  ], { description: 'Use write when the worker may modify files.' })),
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
    description: 'Launch an asynchronous worker for a substantial delegated task.',
    parameters: spawnSchema,
    async execute(_id, input: Static<typeof spawnSchema>) {
      const task = await supervisor.spawn({
        parentAgentId: coordinatorId,
        description: input.description,
        prompt: input.prompt,
        role: input.role,
        workKind: input.work_kind ?? 'read',
      })
      return textResult(
        `Launched ${task.agentId} for "${task.description}" (${task.status}). Results will arrive automatically.`,
        task,
      )
    },
  }
}
