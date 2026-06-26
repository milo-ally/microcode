import { registerTool } from '../registry.ts'
import { createFileReadTool, TOOL_NAME, TOOL_DEFAULT_PERMISSION } from './FileReadTool.ts'
import { FileReadToolUI } from './UI.tsx'
import { basename } from '../../utils/displayUtils.ts'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: createFileReadTool,
  ui: FileReadToolUI,
  display: {
    activity: ({ input }) =>
      typeof input.file_path === 'string'
        ? `Reading ${input.file_path}`
        : 'Reading a file',
    detail: ({ input }) =>
      typeof input.file_path === 'string' ? basename(input.file_path) : 'file',
    status: ({ details }) => {
      if (!details) return 'Reading...'
      const returned = typeof details.returnedLines === 'number' ? details.returnedLines : 0
      const total = typeof details.totalLines === 'number' ? details.totalLines : 0
      return total > 0 ? `${returned}/${total} lines` : `${returned} lines`
    },
  },
  formatDescription: (input) =>
    typeof input.file_path === 'string' ? `read ${input.file_path}` : '(unknown file)',
  extractMatchContent: (input) =>
    typeof input.file_path === 'string' ? input.file_path : undefined,
})
