import { registerTool } from '../registry.ts'
import { createWebSearchTool, TOOL_DEFAULT_PERMISSION, TOOL_NAME } from './WebSearchTool.ts'
import { WebSearchToolUI } from './UI.tsx'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: () => createWebSearchTool(),
  ui: WebSearchToolUI,
  description:
    'Search the web for current information. Supports domain allow/block filters and returns source URLs.',
  shouldDefer: false,
  formatDescription: (input) =>
    typeof input.query === 'string' ? `search "${input.query}"` : 'search web',
  extractMatchContent: (input) =>
    typeof input.query === 'string' ? input.query : undefined,
})
