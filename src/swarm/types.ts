import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { MicrocodeAgent } from '../agent/index.ts'
import type { PermissionMode } from '../permissions/index.ts'

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'waiting_permission'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type AgentWorkKind = 'read' | 'write'

export interface AgentTask {
  id: string
  agentId: string
  parentAgentId: string
  description: string
  prompt: string
  role: string
  workKind: AgentWorkKind
  status: AgentTaskStatus
  result?: string
  error?: string
  createdAt: number
  startedAt?: number
  completedAt?: number
  usage: {
    tokens: number
    toolCalls: number
  }
}

export interface SpawnAgentRequest {
  parentAgentId: string
  description: string
  prompt: string
  role?: string
  modelId?: string
  cwd?: string
  permissionMode?: PermissionMode
  workKind?: AgentWorkKind
}

export interface AgentRuntimeState {
  task: Readonly<AgentTask>
  identity: ReturnType<MicrocodeAgent['getIdentity']>
  activity?: string
}

export type SwarmUIEvent =
  | { type: 'agent_spawned'; task: Readonly<AgentTask> }
  | { type: 'agent_status_changed'; task: Readonly<AgentTask> }
  | { type: 'agent_activity'; task: Readonly<AgentTask>; text: string }
  | { type: 'agent_completed'; task: Readonly<AgentTask> }
  | { type: 'agent_failed'; task: Readonly<AgentTask> }
  | {
      type: 'agent_permission_requested'
      task: Readonly<AgentTask>
      toolName: string
      description: string
    }

export type SwarmUIEventListener = (event: SwarmUIEvent) => void

export interface AgentTranscriptPersistence {
  saveAgentManifest?(tasks: readonly AgentTask[]): Promise<void>
  loadAgentManifest?(): Promise<AgentTask[]>
  saveAgentTranscript?(
    agentId: string,
    messages: readonly AgentMessage[],
  ): Promise<void>
  loadAgentTranscript?(agentId: string): Promise<AgentMessage[]>
}

export interface AgentFactoryContext {
  parent: MicrocodeAgent
  request: SpawnAgentRequest
  agentId: string
  persistence?: AgentTranscriptPersistence
}
