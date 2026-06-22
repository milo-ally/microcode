import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { Type, type Static } from 'typebox'
import type { GitWorktreeSystem } from '../../git/GitWorktreeSystem.ts'
import type { PermissionBehavior } from '../../permissions/types.ts'

export const TOOL_NAME = 'worktree'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'allow'

const gitWorktreeSchema = Type.Object({
  action: Type.Union([
    Type.Literal('commit'),
    Type.Literal('status'),
  ], { description: 'Action: commit (stage all + commit) or status (show working state).' }),
  message: Type.Optional(Type.String({ description: 'Commit message. Required for commit action.' })),
}, { additionalProperties: false })

export type GitWorktreeInput = Static<typeof gitWorktreeSchema>

function textResult(text: string, details?: unknown): AgentToolResult<unknown> {
  return { content: [{ type: 'text', text }], details }
}

export function createGitWorktreeTool(
  getWorktree: () => GitWorktreeSystem | undefined,
): AgentTool<typeof gitWorktreeSchema, unknown> {
  return {
    name: TOOL_NAME,
    label: 'Worktree',
    description: 'Commit changes or check status in the current agent git worktree.',
    parameters: gitWorktreeSchema,
    async execute(
      _id: string,
      input: GitWorktreeInput,
      _signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<unknown>) => void,
    ): Promise<AgentToolResult<unknown>> {
      const system = getWorktree()
      if (!system) {
        return textResult('Not available: no git worktree context.', { error: 'no_worktree' })
      }

      const worktrees = await system.listWorktrees()
      const cwd = process.cwd()
      const state = worktrees.find(w => cwd.startsWith(w.path))

      if (!state) {
        return textResult('Not running in a git worktree.', { error: 'not_in_worktree' })
      }

      if (input.action === 'status') {
        const { execSync } = await import('child_process')
        try {
          const stat = execSync('git status --short', { cwd: state.path, encoding: 'utf8', timeout: 10_000 })
          const diff = execSync('git diff --stat', { cwd: state.path, encoding: 'utf8', timeout: 10_000 })
          const output = stat.trim()
            ? `Changes:\n${stat}`
            : 'No changes (clean working tree)'
          const diffOut = diff.trim() ? `\n\nDiffstat:\n${diff}` : ''
          return textResult(`${output}${diffOut}`, { state })
        } catch (err) {
          return textResult(`Status check failed: ${err instanceof Error ? err.message : String(err)}`, { error: 'status_failed' })
        }
      }

      if (input.action === 'commit') {
        if (!input.message?.trim()) {
          return textResult('A commit message is required for commit action.', { error: 'missing_message' })
        }
        onUpdate?.({
          content: [{ type: 'text', text: `Committing changes in worktree ${state.agentId}...` }],
          details: { state },
        })
        try {
          const hash = await system.commitWorktree(state.agentId, input.message)
          return textResult(
            `Committed changes in worktree '${state.agentId}'.\nCommit: ${hash.slice(0, 8)}`,
            { state, commit: hash },
          )
        } catch (err) {
          return textResult(
            `Commit failed: ${err instanceof Error ? err.message : String(err)}`,
            { error: 'commit_failed' },
          )
        }
      }

      return textResult('Unknown action.', { error: 'unknown_action' })
    },
  }
}
