import { registerTool } from '../registry.ts'
import { createFileWriteTool, TOOL_NAME, TOOL_DEFAULT_PERMISSION } from './FileWriteTool.ts'
import { FileWriteToolUI } from './UI.tsx'
import { basename, formatBytes } from '../../utils/displayUtils.ts'
import { count, joinSummaryParts, statusPrefix, text } from '../summary.ts'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: createFileWriteTool,
  ui: FileWriteToolUI,
  display: {
    activity: ({ input }) =>
      typeof input.file_path === 'string'
        ? `Writing ${input.file_path}`
        : 'Writing a file',
    detail: ({ input }) =>
      typeof input.file_path === 'string' ? basename(input.file_path) : 'write',
    status: ({ details }) => {
      if (!details) return 'Writing...'
      const bytes = typeof details.bytesWritten === 'number' ? details.bytesWritten : 0
      return bytes > 0 ? formatBytes(bytes) : 'Writing...'
    },
    summary: (context) => {
      const details = context.details ?? {}
      const state = details.written === false ? 'not written' : 'written'
      const warning = typeof details.warning === 'string' ? `warning: ${details.warning}` : undefined
      return `[write] ${statusPrefix(context)}${joinSummaryParts([
        text(details.path),
        state,
        count(details.bytesWritten, 'bytes'),
        count(details.additions, 'additions'),
        count(details.removals, 'removals'),
        warning,
      ])}`
    },
  },
  formatDescription: (input) =>
    typeof input.file_path === 'string' ? `write ${input.file_path}` : '(unknown file)',
  extractMatchContent: (input) =>
    typeof input.file_path === 'string' ? input.file_path : undefined,
})
