import { registerTool } from '../registry.ts'
import { createTaskTool, TOOL_DEFAULT_PERMISSION, TOOL_NAME } from './TaskTool.ts'
import { TaskToolUI } from './UI.tsx'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: (_cwd, context) => createTaskTool(_cwd, context),
  ui: TaskToolUI,
  description: 'Create, claim, and mark session-scoped task lists.',
  shouldDefer: false,
  formatDescription: (input) => {
    const action = typeof input.action === 'string' ? input.action : 'manage'
    return `${action} task list`
  },
})
