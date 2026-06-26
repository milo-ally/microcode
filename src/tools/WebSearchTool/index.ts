import { registerTool } from '../registry.ts'
import { createWebSearchTool, TOOL_DEFAULT_PERMISSION, TOOL_NAME } from './WebSearchTool.ts'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: () => createWebSearchTool(),
  description:
    'Search the web for current information. Supports domain allow/block filters and returns source URLs.',
  shouldDefer: false,
  formatDescription: (input) =>
    typeof input.query === 'string' ? `web search ${input.query}` : 'web search',
  extractMatchContent: (input) =>
    typeof input.query === 'string' ? input.query : undefined,
})
