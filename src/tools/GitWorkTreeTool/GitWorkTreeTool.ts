import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import type { AgentSupervisor } from '../../swarm/AgentSupervisor.ts'

export const TOOL_NAME = 'worktree'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'ask'

const schema = Type.Object({
  action: Type.Union([
    Type.Literal('list'),
    Type.Literal('status'),
    Type.Literal('diff'),
    Type.Literal('wait'),
    Type.Literal('merge'),
    Type.Literal('remove'),
  ]),
  agent_id: Type.Optional(Type.String({
    description: 'Agent ID. Required for status, diff, merge, and remove.',
  })),
  batch_id: Type.Optional(Type.String({
    description: 'Batch ID. Required for wait.',
  })),
  timeout: Type.Optional(Type.Number({
    description: 'Maximum seconds to wait. Agents continue running after a timeout.',
  })),
  force: Type.Optional(Type.Boolean({
    description: 'Allow removal of a worktree with unmerged changes.',
  })),
}, { additionalProperties: false })

function textResult<T>(text: string, details: T): AgentToolResult<T> {
  return { content: [{ type: 'text', text }], details }
}

export function createGitWorkTreeTool(
  supervisor: AgentSupervisor,
): AgentTool<typeof schema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Worktree',
    description:
      'Wait for agent batches and inspect, diff, merge, or remove their isolated Git worktrees.',
    parameters: schema,
    async execute(
      _id,
      input: Static<typeof schema>,
      signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<unknown>) => void,
    ) {
      if (input.action === 'list') {
        const worktrees = await supervisor.listWorktrees()
        const text = worktrees.length === 0
          ? 'No agent worktrees.'
          : worktrees.map((item) =>
              `${item.agentId} ${item.phase} ${item.branch} ` +
              `changes=${item.changes.length} ahead=${item.ahead}` +
              `${item.mergeable ? ' mergeable' : ''}`
            ).join('\n')
        return textResult(text, { worktrees })
      }

      if (input.action === 'wait') {
        if (!input.batch_id) {
          throw new Error('batch_id is required for worktree wait.')
        }
        const tasks = await supervisor.waitForBatch(input.batch_id, {
          signal,
          timeoutMs: input.timeout ? input.timeout * 1000 : undefined,
          onProgress: (progress) => {
            onUpdate?.({
              content: [{
                type: 'text',
                text:
                  `Waiting for agent batch ${progress.batchId}: ` +
                  `${progress.completed}/${progress.total} complete.`,
              }],
              details: progress,
            })
          },
        })
        return textResult(
          `Agent batch ${input.batch_id} completed. Results are ready and the automatic agent-results notification will follow.`,
          { batchId: input.batch_id, tasks },
        )
      }

      if (!input.agent_id) {
        throw new Error(`agent_id is required for worktree ${input.action}.`)
      }

      if (input.action === 'status') {
        const status = await supervisor.getWorktreeStatus(input.agent_id)
        return textResult(
          `${status.agentId} ${status.branch}\n` +
          `Phase: ${status.phase}\nPath: ${status.path}\nAhead: ${status.ahead}\n` +
          (status.changes.length > 0 ? status.changes.join('\n') : 'Clean'),
          status,
        )
      }
      if (input.action === 'diff') {
        const diff = await supervisor.getWorktreeDiff(input.agent_id)
        return textResult(diff || 'No changes.', { agentId: input.agent_id, diff })
      }
      if (input.action === 'merge') {
        const result = await supervisor.mergeWorktree(input.agent_id)
        return textResult(result.message, result)
      }

      await supervisor.removeWorktree(input.agent_id, input.force ?? false)
      return textResult(
        `Removed worktree for ${input.agent_id}.`,
        { agentId: input.agent_id, removed: true },
      )
    },
  }
}
