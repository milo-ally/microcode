import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { MicrocodeAgent } from '../agent/index.ts'
import type { PermissionMode } from '../permissions/index.ts'
import type {
  AgentCapability,
  PermissionBlockDetails,
} from '../permissions/index.ts'

export type AgentTaskStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'blocked'
  | 'failed'
  | 'cancelled'
  | 'interrupted'

export type AgentWorkKind = 'read' | 'write'
export type AgentBlocker = PermissionBlockDetails

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
  workKind: AgentWorkKind
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
  permissionMode?: PermissionMode
  capabilities?: AgentCapability[]
  workKind?: AgentWorkKind
}

export interface AgentRuntimeState {
  task: Readonly<AgentTask>
  identity: ReturnType<MicrocodeAgent['getIdentity']>
  activity?: string
  toolHistory: readonly { name: string; done: boolean; error: boolean; detail?: string }[]
}

export type SwarmUIEvent =
  | { type: 'agent_spawned'; task: Readonly<AgentTask> }
  | { type: 'agent_status_changed'; task: Readonly<AgentTask> }
  | { type: 'agent_activity'; task: Readonly<AgentTask>; text: string }
  | { type: 'agent_completed'; task: Readonly<AgentTask> }
  | { type: 'agent_blocked'; task: Readonly<AgentTask> }
  | { type: 'agent_failed'; task: Readonly<AgentTask> }
  | {
      type: 'agent_permission_requested'
      task: Readonly<AgentTask>
      toolName: string
      description: string
    }
  | {
      type: 'agent_permission_blocked'
      task: Readonly<AgentTask>
      blocker: Readonly<AgentBlocker>
    }

export type SwarmUIEventListener = (event: SwarmUIEvent) => void

export interface AgentTranscriptPersistence {
  saveAgentManifest?(
    tasks: readonly AgentTask[],
    batches?: readonly AgentBatch[],
  ): Promise<void>
  loadAgentManifest?(): Promise<AgentTask[]>
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
