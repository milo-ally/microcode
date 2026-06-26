import { registerTool } from '../registry.ts'
import { createWebFetchTool, TOOL_DEFAULT_PERMISSION, TOOL_NAME } from './WebFetchTool.ts'
import { WebFetchToolUI } from './UI.tsx'

registerTool({
  name: TOOL_NAME,
  defaultPermission: TOOL_DEFAULT_PERMISSION,
  createTool: () => createWebFetchTool(),
  ui: WebFetchToolUI,
  description:
    'Fetch a public URL and return readable page content for analysis. Authenticated or private URLs may fail.',
  shouldDefer: false,
  formatDescription: (input) =>
    typeof input.url === 'string' ? `web fetch ${input.url}` : 'web fetch',
  extractMatchContent: (input) =>
    typeof input.url === 'string' ? input.url : undefined,
})
