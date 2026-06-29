import { registerTool } from '../registry.ts'
import { TOOL_SEARCH_TOOL_NAME } from './ToolSearchTool.ts'
import { joinSummaryParts, statusPrefix } from '../summary.ts'

// ToolSearchTool itself is never deferred — the model needs it to discover other tools.
// The actual creation happens in agent.ts with proper callbacks; here we register a
// placeholder that will be overridden at agent creation time.
registerTool({
  name: TOOL_SEARCH_TOOL_NAME,
  defaultPermission: 'allow',
  createTool: () => {
    // This placeholder should not be called directly.
    // The real instance is created in agent.ts via createToolSearchTool().
    throw new Error('ToolSearchTool must be created via createToolSearchTool() in agent.ts')
  },
  description: 'Discover and load deferred tools by name or keyword',
  shouldDefer: false,
  display: {
    summary: (context) => {
      const details = context.details ?? {}
      const query = typeof details.query === 'string' ? `query="${details.query}"` : undefined
      const matches = Array.isArray(details.matches) ? details.matches : []
      return `[tool_search] ${statusPrefix(context)}${joinSummaryParts([
        query,
        `${matches.length} matches`,
        matches.length > 0 ? `tools: ${matches.slice(0, 8).join(', ')}${matches.length > 8 ? ', ...' : ''}` : undefined,
      ])}`
    },
  },
  formatDescription: (input) => typeof input.query === 'string' ? `search: ${input.query}` : '(tool search)',
  extractMatchContent: (input) => typeof input.query === 'string' ? input.query : undefined,
})
