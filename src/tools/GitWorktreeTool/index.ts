import { registerTool } from '../registry.ts'
import { TOOL_NAME, TOOL_DEFAULT_PERMISSION, createGitWorktreeTool } from './GitWorktreeTool.ts'
import { GitWorktreeToolUI } from './UI.tsx'

export function registerGitWorktreeTool(
  getWorktree: () => import('../../git/GitWorktreeSystem.ts').GitWorktreeSystem | undefined,
): void {
  registerTool({
    name: TOOL_NAME,
    defaultPermission: TOOL_DEFAULT_PERMISSION,
    createTool: (_cwd) => createGitWorktreeTool(getWorktree),
    ui: GitWorktreeToolUI,
    description: 'Commit changes and check status within a git worktree.',
    shouldDefer: false,
  })
}
