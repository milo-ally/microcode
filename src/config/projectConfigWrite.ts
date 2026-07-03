import { mkdir, readFile, writeFile } from 'fs/promises'
import { dirname } from 'path'
import type { CustomModelDef } from '../models/custom.ts'
import { getProjectConfigPath } from '../mcp/config.ts'
import type { McpServerConfig } from '../mcp/types.ts'

export interface ProjectConfigWriteResult {
  path: string
  count: number
  names: string[]
}

type ProjectConfig = Record<string, unknown> & {
  mcpServers?: Record<string, McpServerConfig>
  models?: CustomModelDef[]
}

async function readProjectConfig(path: string): Promise<ProjectConfig> {
  try {
    const raw = await readFile(path, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as ProjectConfig : {}
  } catch {
    return {}
  }
}

async function writeProjectConfig(path: string, config: ProjectConfig): Promise<void> {
  await mkdir(dirname(path), { recursive: true })
  await writeFile(path, `${JSON.stringify(config, null, 2)}\n`, 'utf-8')
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw)
  } catch (error) {
    throw new Error(`Invalid JSON: ${error instanceof Error ? error.message : String(error)}`)
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function validateMcpServer(name: string, value: unknown): McpServerConfig {
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) {
    throw new Error(`Invalid MCP server name "${name}". Use letters, numbers, hyphens, or underscores.`)
  }
  if (!isRecord(value)) throw new Error(`Invalid MCP server "${name}": expected an object.`)
  if (typeof value.command === 'string') return value as unknown as McpServerConfig
  if (typeof value.url === 'string' && ['sse', 'http', 'streamableHttp', 'ws'].includes(String(value.type))) {
    return value as unknown as McpServerConfig
  }
  throw new Error(`Invalid MCP server "${name}": expected stdio { command } or remote { type, url }.`)
}

function extractMcpServers(parsed: unknown): Record<string, McpServerConfig> {
  if (!isRecord(parsed)) throw new Error('MCP config must be a JSON object.')
  const source = isRecord(parsed.mcpServers) ? parsed.mcpServers : parsed
  const entries = Object.entries(source)
  if (entries.length === 0) throw new Error('No MCP servers found in pasted config.')
  return Object.fromEntries(entries.map(([name, server]) => [name, validateMcpServer(name, server)]))
}

function validateModel(value: unknown): CustomModelDef {
  if (!isRecord(value)) throw new Error('Invalid model: expected an object.')
  const required = ['id', 'name', 'api', 'baseUrl'] as const
  for (const key of required) {
    if (typeof value[key] !== 'string' || !String(value[key]).trim()) {
      throw new Error(`Invalid model: "${key}" is required.`)
    }
  }
  if (typeof value.contextWindow !== 'number') throw new Error('Invalid model: "contextWindow" must be a number.')
  if (typeof value.maxTokens !== 'number') throw new Error('Invalid model: "maxTokens" must be a number.')
  return value as unknown as CustomModelDef
}

function extractModels(parsed: unknown): CustomModelDef[] {
  const source = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.models)
      ? parsed.models
      : isRecord(parsed)
        ? [parsed]
        : []
  const models = source.map(validateModel)
  if (models.length === 0) throw new Error('No models found in pasted config.')
  return models
}

export async function mergeProjectMcpServers(cwd: string, rawJson: string): Promise<ProjectConfigWriteResult> {
  const servers = extractMcpServers(parseJson(rawJson))
  const path = getProjectConfigPath(cwd)
  const config = await readProjectConfig(path)
  config.mcpServers = { ...(config.mcpServers ?? {}), ...servers }
  await writeProjectConfig(path, config)
  const names = Object.keys(servers)
  return { path, count: names.length, names }
}

export async function mergeProjectModels(cwd: string, rawJson: string): Promise<ProjectConfigWriteResult> {
  const models = extractModels(parseJson(rawJson))
  const path = getProjectConfigPath(cwd)
  const config = await readProjectConfig(path)
  const merged = new Map<string, CustomModelDef>()
  for (const model of config.models ?? []) merged.set(model.id, model)
  for (const model of models) merged.set(model.id, model)
  config.models = [...merged.values()]
  await writeProjectConfig(path, config)
  return { path, count: models.length, names: models.map((model) => model.id) }
}
