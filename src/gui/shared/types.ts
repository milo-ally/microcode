import type { ThinkingLevel } from '@earendil-works/pi-agent-core'
import type { Api } from '@earendil-works/pi-ai'
import type { PermissionMode } from '../../permissions/index.ts'
import type { MicrocodeAgentSnapshot } from '../../agent/index.ts'
import type { McpServerState } from '../../mcp/types.ts'
import type { AgentRuntimeState } from '../../swarm/types.ts'
import type { TaskList } from '../../tasks/TaskSystem.ts'

export type GuiChatRole = 'user' | 'assistant' | 'system'

export interface GuiTextBlock {
  type: 'text'
  text: string
}

export interface GuiThinkingBlock {
  type: 'thinking'
  thinking: string
}

export interface GuiImageBlock {
  type: 'image'
  label: string
}

export type GuiMessageBlock = GuiTextBlock | GuiThinkingBlock | GuiImageBlock

export interface GuiMessageItem {
  id: string
  kind: 'message'
  role: GuiChatRole
  blocks: GuiMessageBlock[]
  streaming?: boolean
  stopReason?: string
  errorMessage?: string
  createdAt: number
}

export interface GuiToolItem {
  id: string
  kind: 'tool'
  toolCallId: string
  toolName: string
  args: Record<string, unknown>
  status: 'pending' | 'running' | 'complete' | 'error'
  startedAt?: number
  finishedAt?: number
  elapsedMs?: number
  output?: string
  details?: Record<string, unknown>
  isError?: boolean
}

export interface GuiNoticeItem {
  id: string
  kind: 'notice'
  level: 'info' | 'warning' | 'error' | 'success'
  text: string
  createdAt: number
}

export interface GuiPermissionItem {
  id: string
  kind: 'permission'
  requestId: string
  requestKind: 'tool' | 'question' | 'delegated'
  toolName: string
  input: Record<string, unknown>
  description?: string
  status: 'pending' | 'allowed' | 'denied'
  createdAt: number
}

export type GuiChatItem =
  | GuiMessageItem
  | GuiToolItem
  | GuiNoticeItem
  | GuiPermissionItem

export interface GuiQuestionOption {
  label: string
  description: string
}

export interface GuiQuestion {
  question: string
  header: string
  options: GuiQuestionOption[]
  multiSelect?: boolean
}

export interface GuiPermissionRequest {
  id: string
  kind: 'tool' | 'delegated'
  toolName: string
  input: Record<string, unknown>
  description: string
}

export interface GuiQuestionRequest {
  id: string
  toolName: string
  input: Record<string, unknown>
  questions: GuiQuestion[]
}

export interface GuiRuntimeSnapshot {
  agent: MicrocodeAgentSnapshot
  cwd: string
  sessionId: string | null
  sessionTitle?: string
  mcpServers: McpServerState[]
  agents: AgentRuntimeState[]
  tasks: TaskList[]
  runningWorkers: number
  maxWorkers: number
  busy: boolean
  activePermission?: GuiPermissionRequest
  activeQuestion?: GuiQuestionRequest
  sessions: GuiSessionListItem[]
  models: GuiModelListItem[]
  skills: GuiSkillListItem[]
  config: GuiConfigSummary
}

export interface GuiSessionListItem {
  id: string
  cwd: string
  createdAt?: number
  updatedAt?: number
  title?: string
}

export interface GuiModelListItem {
  id: string
  name: string
  api: Api
  provider: string
  baseUrl: string
  contextWindow: number
  maxTokens: number
  reasoning: boolean
  vision: boolean
  custom: boolean
  current: boolean
  apiKeyEnv: string
  apiKeyConfigured: boolean
}

export interface GuiSkillListItem {
  name: string
  description: string
  filePath: string
  loaded: boolean
  disabled: boolean
}

export interface GuiConfigSummary {
  userConfigPath: string
  projectConfigPath: string
  modelEnv: Record<string, boolean>
}

export type GuiIpcEvent =
  | { type: 'ready'; snapshot: GuiRuntimeSnapshot; timeline: GuiChatItem[] }
  | { type: 'timeline'; timeline: GuiChatItem[] }
  | { type: 'snapshot'; snapshot: GuiRuntimeSnapshot }
  | { type: 'notice'; item: GuiNoticeItem }

export interface GuiPromptInput {
  text: string
  imagePaths?: string[]
}

export type GuiPermissionDecision = 'allow' | 'allow-session' | 'deny'

export interface GuiApiConfigInput {
  modelKey: string
  apiKey?: string
  baseUrl?: string
}

export interface GuiApi {
  start(options?: { resume?: boolean; resumeSessionId?: string; modelId?: string; permissionMode?: PermissionMode; thinkingLevel?: ThinkingLevel }): Promise<{ snapshot: GuiRuntimeSnapshot; timeline: GuiChatItem[] }>
  prompt(input: GuiPromptInput): Promise<void>
  command(command: string): Promise<void>
  abort(): Promise<void>
  shutdown(): Promise<void>
  setModel(modelId: string): Promise<void>
  setApiConfig(input: GuiApiConfigInput): Promise<void>
  setThinkingLevel(level: ThinkingLevel): Promise<void>
  setPermissionMode(mode: PermissionMode): Promise<void>
  switchSession(sessionId: string): Promise<void>
  newSession(): Promise<void>
  toggleSkill(skillName: string): Promise<void>
  remindTask(listId: string, taskId: string, reminder: boolean): Promise<void>
  mcpAction(action: 'enable' | 'disable' | 'reconnect', serverName: string): Promise<void>
  pickImages(): Promise<string[]>
  answerPermission(requestId: string, decision: GuiPermissionDecision): Promise<void>
  answerQuestion(requestId: string, answers: Record<string, string>, block?: boolean): Promise<void>
  listSessions(): Promise<GuiSessionListItem[]>
  onEvent(listener: (event: GuiIpcEvent) => void): () => void
}
