import { registerTool } from '../registry.ts'
import { createFileEditTool, TOOL_NAME, TOOL_DEFAULT_PERMISSION } from './FileEditTool.ts'
import { FileEditToolUI } from './UI.tsx'
import { basename } from '../../utils/displayUtils.ts'
import { count, joinSummaryParts, statusPrefix, text } from '../summary.ts'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: createFileEditTool,
  ui: FileEditToolUI,
  display: {
    activity: ({ input }) =>
      typeof input.file_path === 'string'
        ? `Editing ${input.file_path}`
        : 'Editing a file',
    detail: ({ input }) =>
      typeof input.file_path === 'string' ? basename(input.file_path) : 'edit',
    status: ({ details }) => {
      if (!details) return 'Editing...'
      if (details.phase === 'preparing') return 'Preparing...'
      if (details.phase === 'writing') return 'Writing...'
      const additions = typeof details.additions === 'number' ? details.additions : 0
      const removals = typeof details.removals === 'number' ? details.removals : 0
      return `${additions}+ ${removals}-`
    },
    summary: (context) => {
      const details = context.details ?? {}
      return `[edit] ${statusPrefix(context)}${joinSummaryParts([
        text(details.path),
        count(details.replacements, 'replacements'),
        count(details.additions, 'additions'),
        count(details.removals, 'removals'),
      ])}`
    },
  },
  formatDescription: (input) =>
    typeof input.file_path === 'string' ? `edit ${input.file_path}` : '(unknown file)',
  extractMatchContent: (input) =>
    typeof input.file_path === 'string' ? input.file_path : undefined,
})
