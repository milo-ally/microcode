import { registerTool } from '../registry.ts'
import { createTaskTool, TOOL_DEFAULT_PERMISSION, TOOL_NAME } from './TaskTool.ts'
import { TaskToolUI } from './UI.tsx'
import { count, joinSummaryParts, statusPrefix } from '../summary.ts'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: (_cwd, context) => createTaskTool(_cwd, context),
  ui: TaskToolUI,
  description: 'Create, claim, and mark session-scoped task lists.',
  shouldDefer: false,
  display: {
    status: ({ input }) => {
      const action = typeof input.action === 'string' ? input.action : ''
      return action ? `Tasks · ${action}` : 'Tasks...'
    },
    summary: (context) => {
      const details = context.details ?? {}
      const action = typeof details.action === 'string' ? `action=${details.action}` : undefined
      const list = details.list as any
      const title = typeof list?.title === 'string' ? `list="${list.title}"` : undefined
      const stats = list?.stats
      const total = typeof stats?.total === 'number' ? stats.total : Array.isArray(list?.tasks) ? list.tasks.length : undefined
      return `[task] ${statusPrefix(context)}${joinSummaryParts([
        action,
        title,
        count(total, 'tasks'),
        count(stats?.completed, 'completed'),
        count(stats?.remaining, 'remaining'),
      ])}`
    },
  },
  formatDescription: (input) => {
    const action = typeof input.action === 'string' ? input.action : 'manage'
    return `${action} task list`
  },
})
