import { registerTool } from '../registry.ts'
import { createWebSearchTool, TOOL_DEFAULT_PERMISSION, TOOL_NAME } from './WebSearchTool.ts'
import { WebSearchToolUI } from './UI.tsx'
import { preview } from '../../utils/displayUtils.ts'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: () => createWebSearchTool(),
  ui: WebSearchToolUI,
  description:
    'Search the web for current information. Supports domain allow/block filters and returns source URLs.',
  shouldDefer: false,
  display: {
    activity: ({ input }) =>
      typeof input.query === 'string'
        ? `Searching ${input.query}`
        : 'Searching the web',
    detail: ({ input }) =>
      typeof input.query === 'string' ? preview(input.query, 42) : 'web search',
    status: ({ details }) => {
      if (!details) return 'Searching...'
      const results = Array.isArray(details.results) ? details.results.length : undefined
      return results !== undefined && results > 0 ? `${results} results` : undefined
    },
  },
  formatDescription: (input) =>
    typeof input.query === 'string' ? `search "${input.query}"` : 'search web',
  extractMatchContent: (input) =>
    typeof input.query === 'string' ? input.query : undefined,
})
