import type { McpServerState } from './types.ts'

export function getMcpInstructionsSection(
  mcpServers: McpServerState[] | undefined,
): string | null {
  if (!mcpServers || mcpServers.length === 0) return null

  const connectedServers = mcpServers.filter(s => s.status === 'connected')
  if (connectedServers.length === 0) return null

  const toolList = connectedServers
    .flatMap(s => s.tools.map(t => `- mcp__${s.name}__${t.name}: ${t.description}`))
    .join('\n')

  const hasResources = connectedServers.some(s => s.resources.length > 0)

  let resourceSection = ''
  if (hasResources) {
    const resourceList = connectedServers
      .filter(s => s.resources.length > 0)
      .flatMap(s => s.resources.map(r => `- ${r.uri} (${r.serverName}): ${r.description ?? r.name}`))
      .join('\n')

    resourceSection = `

## MCP Resources

You also have access to MCP resources. Use the \`mcp__list_resources\` tool to discover available resources and \`mcp__read_resource\` to read them.

Available MCP resources:
${resourceList}`
  }

  return `# MCP Tools

You have access to tools provided by Model Context Protocol (MCP) servers. These tools are prefixed with "mcp__<server_name>__<tool_name>".

Available MCP tools (name and brief description only; schemas are intentionally deferred):
${toolList}

Before calling an MCP tool from this list, first call the \`search\` tool with \`select:<exact_tool_name>\` to load that single tool and read its full parameter schema. Do not guess unavailable MCP tool names or adjacent browser-action names; if a desired MCP tool is missing or a call reports "Tool not found", search the available MCP tools instead of trying another guessed name.

When using MCP tools, pass the appropriate parameters as defined by the schema returned by \`search\`. MCP tool results are returned as text content.${resourceSection}`
}
