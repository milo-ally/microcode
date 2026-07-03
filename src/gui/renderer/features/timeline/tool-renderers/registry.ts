import { BashToolRenderer } from './BashToolRenderer.ts'
import {
  AgentControlToolRenderer,
  AskToolRenderer,
  FallbackToolRenderer,
  McpToolRenderer,
  SkillToolRenderer,
  TaskToolRenderer,
  ToolSearchRenderer,
  VisionToolRenderer,
} from './ControlToolRenderers.ts'
import { FileEditToolRenderer, FileReadToolRenderer, FileWriteToolRenderer } from './FileToolRenderers.ts'
import { GlobToolRenderer, GrepToolRenderer, WebFetchToolRenderer, WebSearchToolRenderer } from './SearchToolRenderers.ts'
import type { ToolRenderer } from './types.ts'

const renderers = new Map<string, ToolRenderer>([
  ['bash', BashToolRenderer],
  ['read', FileReadToolRenderer],
  ['write', FileWriteToolRenderer],
  ['edit', FileEditToolRenderer],
  ['grep', GrepToolRenderer],
  ['glob', GlobToolRenderer],
  ['WebSearch', WebSearchToolRenderer],
  ['WebFetch', WebFetchToolRenderer],
  ['vision', VisionToolRenderer],
  ['task', TaskToolRenderer],
  ['Ask', AskToolRenderer],
  ['spawn', AgentControlToolRenderer],
  ['message', AgentControlToolRenderer],
  ['stop', AgentControlToolRenderer],
  ['delete', AgentControlToolRenderer],
  ['status', AgentControlToolRenderer],
  ['worktree', AgentControlToolRenderer],
  ['skill', SkillToolRenderer],
  ['search', ToolSearchRenderer],
])

export function getToolRenderer(toolName: string): ToolRenderer {
  if (toolName.startsWith('mcp__')) return McpToolRenderer
  return renderers.get(toolName) ?? FallbackToolRenderer
}
