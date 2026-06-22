import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { MicrocodeAgent } from '../agent/index.ts'
import type { PermissionMode } from '../permissions/index.ts'

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export interface AgentBlocker {
  toolName: string
  reason: string
}

export interface AgentBatch {
  id: string
  coordinatorTurnId: string
  status: 'open' | 'sealed' | 'delivered'
  taskIds: string[]
  createdAt: number
  sealedAt?: number
}

export interface AgentTask {
  id: string
  batchId: string
  agentId: string
  parentAgentId: string
  description: string
  prompt: string
  role: string
  status: AgentTaskStatus
  result?: string
  blockers: AgentBlocker[]
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
  tools?: string[]
}

export interface AgentRuntimeState {
  task: Readonly<AgentTask>
  identity: ReturnType<MicrocodeAgent['getIdentity']>
  activity?: string
  toolHistory: readonly { name: string; done: boolean; error: boolean; detail?: string; startedAt?: number; status?: string }[]
}

export type SwarmUIEvent =
  | { type: 'agent_spawned'; task: Readonly<AgentTask> }
  | { type: 'agent_status_changed'; task: Readonly<AgentTask> }
  | { type: 'agent_activity'; task: Readonly<AgentTask>; text: string }
  | { type: 'agent_completed'; task: Readonly<AgentTask> }
  | { type: 'agent_blocked'; task: Readonly<AgentTask> }
  | { type: 'agent_failed'; task: Readonly<AgentTask> }
  | { type: 'swarm:worker-revived'; workerId: string; timestamp: number }

export type SwarmUIEventListener = (event: SwarmUIEvent) => void

export interface AgentMeta {
  agentId: string
  taskId: string
  batchId: string
  description: string
  prompt: string
  role: string
  parentAgentId: string
  permissionMode: PermissionMode | undefined
}

export interface AgentTranscriptPersistence {
  saveAgentManifest?(
    tasks: readonly AgentTask[],
    batches?: readonly AgentBatch[],
    agentMetas?: readonly AgentMeta[],
  ): Promise<void>
  loadAgentManifest?(): Promise<{
    tasks: AgentTask[]
    batches?: AgentBatch[]
    agentMetas?: AgentMeta[]
  }>
  loadAgentBatches?(): Promise<AgentBatch[]>
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
