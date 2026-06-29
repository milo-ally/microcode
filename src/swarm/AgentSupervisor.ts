import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage, ToolResultMessage } from '@earendil-works/pi-ai'
import type { MicrocodeAgent } from '../agent/index.ts'
import type {
  GitWorkTreeMergeResult,
  GitWorkTreeStatus,
  GitWorkTreeSystem,
} from '../git/index.ts'
import { AgentRegistry } from './AgentRegistry.ts'
import { AgentTaskStore } from './AgentTaskStore.ts'
import { createWorkerAgent } from './AgentFactory.ts'
import type { PermissionMode as _PermissionMode } from '../permissions/index.ts'
import {
  formatToolActivity,
  formatToolDetail,
  formatToolStatus,
} from '../tools/registry.ts'
import type {
  AgentBatch,
  AgentMeta,
  AgentRuntimeState,
  AgentTask,
  AgentWorktreeStatus,
  AgentTranscriptPersistence,
  SwarmUIEvent,
  SwarmUIEventListener,
  SpawnAgentRequest,
} from './types.ts'

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function textBlocksLength(message: ToolResultMessage): { chars: number; lines: number } {
  const text = message.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
  return {
    chars: text.length,
    lines: text ? text.split('\n').length : 0,
  }
}

function formatCount(value: unknown, noun: string): string | undefined {
  return typeof value === 'number' ? `${value.toLocaleString()} ${noun}` : undefined
}

function formatPath(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function summarizeToolResult(message: ToolResultMessage): string {
  const details = (message.details ?? {}) as Record<string, any>
  const { chars, lines } = textBlocksLength(message)
  const produced = `produced ${chars.toLocaleString()} chars${lines > 0 ? ` across ${lines.toLocaleString()} lines` : ''}`
  const errorPrefix = message.isError ? 'failed: ' : ''

  switch (message.toolName) {
    case 'read': {
      const path = formatPath(details.path)
      const returned = formatCount(details.returnedLines, 'returned lines')
      const total = formatCount(details.totalLines, 'total lines')
      const truncated = details.truncated ? 'truncated' : 'complete'
      return `[read] ${errorPrefix}${[path, returned, total, truncated].filter(Boolean).join(' · ')}`
    }
    case 'write': {
      const path = formatPath(details.path)
      const bytes = formatCount(details.bytesWritten, 'bytes')
      const additions = formatCount(details.additions, 'additions')
      const removals = formatCount(details.removals, 'removals')
      const state = details.written === false ? 'not written' : 'written'
      const warning = typeof details.warning === 'string' ? `warning: ${details.warning}` : undefined
      return `[write] ${errorPrefix}${[path, state, bytes, additions, removals, warning].filter(Boolean).join(' · ')}`
    }
    case 'edit': {
      const path = formatPath(details.path)
      const replacements = formatCount(details.replacements, 'replacements')
      const additions = formatCount(details.additions, 'additions')
      const removals = formatCount(details.removals, 'removals')
      return `[edit] ${errorPrefix}${[path, replacements, additions, removals].filter(Boolean).join(' · ')}`
    }
    case 'grep': {
      const files = formatCount(details.numFiles, 'files')
      const matches = formatCount(details.numMatches, 'matches')
      const linesFound = formatCount(details.numLines, 'lines')
      const mode = typeof details.mode === 'string' ? `mode=${details.mode}` : undefined
      const truncated = details.truncated ? 'truncated' : undefined
      const examples = Array.isArray(details.filenames) && details.filenames.length > 0
        ? `files: ${details.filenames.slice(0, 5).join(', ')}${details.filenames.length > 5 ? ', ...' : ''}`
        : undefined
      return `[grep] ${errorPrefix}${[mode, files, matches, linesFound, truncated, examples].filter(Boolean).join(' · ')}`
    }
    case 'glob': {
      const files = formatCount(details.numFiles, 'files')
      const truncated = details.truncated ? 'truncated' : undefined
      const duration = typeof details.durationMs === 'number' ? `${details.durationMs}ms` : undefined
      const examples = Array.isArray(details.filenames) && details.filenames.length > 0
        ? `files: ${details.filenames.slice(0, 8).join(', ')}${details.filenames.length > 8 ? ', ...' : ''}`
        : undefined
      return `[glob] ${errorPrefix}${[files, truncated, duration, examples].filter(Boolean).join(' · ')}`
    }
    case 'bash': {
      const exitCode = details.exitCode === null || typeof details.exitCode === 'number'
        ? `exit=${details.exitCode}`
        : undefined
      return `[bash] ${errorPrefix}${[exitCode, produced].filter(Boolean).join(' · ')}`
    }
    case 'WebFetch': {
      const url = formatPath(details.finalUrl) ?? formatPath(details.url)
      const status = typeof details.code === 'number' ? `HTTP ${details.code}${details.codeText ? ` ${details.codeText}` : ''}` : undefined
      const bytes = formatCount(details.bytes, 'bytes')
      const type = typeof details.contentType === 'string' && details.contentType ? details.contentType : undefined
      const truncated = details.truncated ? 'truncated' : undefined
      return `[WebFetch] ${errorPrefix}${[url, status, bytes, type, truncated].filter(Boolean).join(' · ')}`
    }
    case 'WebSearch': {
      const query = typeof details.query === 'string' ? `query="${details.query}"` : undefined
      const count = Array.isArray(details.results) ? `${details.results.length} results` : undefined
      const examples = Array.isArray(details.results) && details.results.length > 0
        ? `top: ${details.results.slice(0, 3).map((item: any) => item.title || item.url).filter(Boolean).join('; ')}`
        : undefined
      return `[WebSearch] ${errorPrefix}${[query, count, examples].filter(Boolean).join(' · ')}`
    }
    case 'vision': {
      const source = formatPath(details.source)
      const type = typeof details.sourceType === 'string' ? details.sourceType : undefined
      const mime = typeof details.mimeType === 'string' ? details.mimeType : undefined
      return `[vision] ${errorPrefix}${[source, type, mime].filter(Boolean).join(' · ')}`
    }
    default: {
      if (message.toolName.startsWith('mcp__')) {
        return `[${message.toolName}] ${errorPrefix}MCP tool completed · ${produced}`
      }
      return `[${message.toolName}] ${errorPrefix}tool completed · ${produced}`
    }
  }
}

export function extractWorkerResult(messages: readonly AgentMessage[]): string {
  const parts: string[] = []

  for (const message of messages) {
    if (message.role === 'assistant') {
      const text = (message as AssistantMessage).content
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('\n')
        .trim()
      if (text) parts.push(text)
    } else if (message.role === 'toolResult') {
      parts.push(summarizeToolResult(message as ToolResultMessage))
    }
  }

  return parts.join('\n').trim()
}

export interface AgentSupervisorOptions {
  coordinator: MicrocodeAgent
  maxWorkers?: number
  maxHistory?: number
  timeoutMs?: number
  /** @deprecated Batches are sealed from coordinator lifecycle events. */
  notifyDebounceMs?: number
  persistence?: AgentTranscriptPersistence
  createWorker?: typeof createWorkerAgent
  configureWorker?: (worker: MicrocodeAgent) => void
  worktreeSystem?: GitWorkTreeSystem
}

export class AgentSupervisor {
  readonly registry = new AgentRegistry()
  readonly tasks: AgentTaskStore
  private readonly coordinator: MicrocodeAgent
  private readonly maxWorkers: number
  private readonly timeoutMs: number
  private readonly persistence?: AgentTranscriptPersistence
  private readonly workerFactory: typeof createWorkerAgent
  private readonly configureWorker?: (worker: MicrocodeAgent) => void
  private readonly worktreeSystem?: GitWorkTreeSystem
  private readonly listeners = new Set<SwarmUIEventListener>()
  private readonly queue: string[] = []
  private readonly activities = new Map<string, string>()
  private readonly toolHistory = new Map<string, { name: string; done: boolean; error: boolean; detail?: string; startedAt?: number; status?: string }[]>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly unsubscribers = new Map<string, () => void>()
  private readonly queuedPrompts = new Map<string, string>()
  private readonly batches = new Map<string, AgentBatch>()
  private sleepingAgentMetas: AgentMeta[] = []
  private currentCoordinatorTurnId?: string
  private coordinatorUnsubscribe?: () => void
  private sealTimer: ReturnType<typeof setTimeout> | null = null
  private shuttingDown = false

  constructor(options: AgentSupervisorOptions) {
    this.tasks = new AgentTaskStore({ maxHistory: options.maxHistory })
    this.coordinator = options.coordinator
    this.maxWorkers = Math.max(1, options.maxWorkers ?? 4)
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 30 * 60 * 1000)
    this.persistence = options.persistence
    this.workerFactory = options.createWorker ?? createWorkerAgent
    this.configureWorker = options.configureWorker
    this.worktreeSystem = options.worktreeSystem
    this.registry.register(this.coordinator)
    this.attachCoordinator()
  }

  async restore(): Promise<void> {
    const manifest = await this.persistence?.loadAgentManifest?.()
    const batches = await this.persistence?.loadAgentBatches?.()
    if (manifest) {
      const tasks = Array.isArray(manifest) ? manifest : manifest.tasks
      this.tasks.restore(tasks)
      if (manifest.agentMetas) {
        this.sleepingAgentMetas = manifest.agentMetas
      }
      for (const batch of batches ?? []) {
        this.batches.set(batch.id, {
          ...batch,
          taskIds: [...batch.taskIds],
        })
      }
      for (const task of this.tasks.list()) {
        if (!this.batches.has(task.batchId)) {
          this.batches.set(task.batchId, {
            id: task.batchId,
            coordinatorTurnId: 'restored',
            status: 'sealed',
            taskIds: this.tasks.list()
              .filter((candidate) => candidate.batchId === task.batchId)
              .map((candidate) => candidate.id),
            createdAt: task.createdAt,
            sealedAt: Date.now(),
          })
        }
      }
      for (const batch of this.batches.values()) {
        if (batch.status === 'open') {
          batch.status = 'sealed'
          batch.sealedAt = Date.now()
        }
      }
      await this.persistManifest()
      for (const batch of this.batches.values()) this.tryDeliverBatch(batch.id)
    }
    await this.resumeSession()
  }

  async prepareSessionSwitch(): Promise<void> {
    this.sleepingAgentMetas = []

    // Save worktree references for ALL agents — not just active ones.
    // Otherwise completed agents' worktrees are lost after restore, but git branches
    // remain, causing "No worktree found" errors.
    for (const task of this.tasks.list()) {
      const worktree = this.worktreeSystem?.get(task.agentId)
      if (worktree) {
        this.sleepingAgentMetas.push({
          agentId: task.agentId,
          taskId: task.id,
          batchId: task.batchId,
          description: task.description,
          prompt: task.prompt,
          role: task.role,
          parentAgentId: task.parentAgentId,
          permissionMode: undefined,
          worktree,
        })
      }
    }

    const active = this.tasks.list().filter((task) =>
      task.status === 'queued' ||
      task.status === 'running' ||
      task.status === 'blocked'
    )
    for (const task of active) {
      const agent = this.registry.get(task.agentId)
      if (agent) {
        // Update the sleeping meta with the live permission mode
        const meta = this.sleepingAgentMetas.find((m) => m.agentId === task.agentId)
        if (meta) meta.permissionMode = agent.getPermissionMode()
        agent.abort()
      }
      this.clearTimer(task.id)
      this.tasks.update(task.id, {
        status: 'interrupted',
        error: 'Interrupted when switching sessions.',
        completedAt: Date.now(),
      })
    }
    await Promise.all(
      this.registry.list()
        .filter((agent) => agent.getId() !== this.coordinator.getId())
        .map((agent) => agent.waitForIdle()),
    )
    await this.persistManifest()
    for (const [agentId, unsubscribe] of this.unsubscribers) {
      unsubscribe()
      this.registry.remove(agentId)
    }
    this.unsubscribers.clear()
    this.queue.length = 0
    this.activities.clear()
    this.queuedPrompts.clear()
    this.tasks.clear()
    this.batches.clear()
  }

  async resumeSession(): Promise<void> {
    for (const meta of this.sleepingAgentMetas) {
      const task = this.tasks.get(meta.taskId)
      if (task) {
        await this.reviveWorker(meta)
      }
    }
    this.sleepingAgentMetas = []
  }

  private async reviveWorker(
    meta: (typeof this.sleepingAgentMetas)[number],
  ): Promise<void> {
    if (meta.worktree && this.worktreeSystem) {
      await this.worktreeSystem.restore(meta.worktree)
    }
    const request: SpawnAgentRequest = {
      description: meta.description,
      prompt: meta.prompt,
      role: meta.role,
      parentAgentId: meta.parentAgentId,
      cwd: meta.worktree?.path,
    }
    const worker = createWorkerAgent({
      parent: this.coordinator,
      request,
      agentId: meta.agentId,
      persistence: this.persistence,
    })
    this.configureWorker?.(worker)
    this.registry.register(worker)
    this.attachWorker(worker, meta.taskId)
    this.emit({
      type: 'swarm:worker-revived',
      workerId: meta.agentId,
      timestamp: Date.now(),
    })
  }

  subscribe(listener: SwarmUIEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Push parent permission rules to all worker agents. */
  syncPermissionsToWorkers(updateMode = false): void {
    const snapshot = this.coordinator.getPermissionSnapshot()
    for (const agent of this.registry.list()) {
      if (agent.getId() === this.coordinator.getId()) continue
      agent.inheritPermissions(snapshot, [], updateMode)
    }
  }

  getMaxWorkers(): number {
    return this.maxWorkers
  }

  getTask(taskId: string): Readonly<AgentTask> | undefined {
    return this.tasks.get(taskId)
  }

  listAgents(): readonly AgentRuntimeState[] {
    const latestByAgent = new Map<string, Readonly<AgentTask>>()
    for (const task of this.tasks.list()) latestByAgent.set(task.agentId, task)
    return [...latestByAgent.values()].map((task) => ({
      task,
      identity: this.registry.get(task.agentId)?.getIdentity() ?? {
        id: task.agentId,
        name: task.description,
        role: task.role,
        parentId: task.parentAgentId,
      },
      activity: this.activities.get(task.agentId),
      toolHistory: this.toolHistory.get(task.agentId) ?? [],
    }))
  }

  getToolHistory(agentId: string): readonly { name: string; done: boolean; error: boolean; detail?: string }[] {
    return this.toolHistory.get(agentId) ?? []
  }

  getRunningCount(): number {
    return this.tasks.list().filter((task) =>
      task.status === 'running'
    ).length
  }

  async spawn(request: SpawnAgentRequest): Promise<Readonly<AgentTask>> {
    if (this.shuttingDown) throw new Error('Agent supervisor is shutting down.')
    if (request.parentAgentId !== this.coordinator.getId()) {
      throw new Error('Workers cannot create child agents.')
    }
    if (!request.description.trim() || !request.prompt.trim()) {
      throw new Error('Agent description and prompt are required.')
    }

    const taskId = createId('task')
    const agentId = createId('agent')
    const worktree = this.worktreeSystem
      ? await this.worktreeSystem.create(agentId)
      : undefined
    const workerRequest = worktree
      ? { ...request, cwd: worktree.path }
      : request
    const batch = this.ensureOpenBatch()
    const task = this.tasks.create(workerRequest, { taskId, agentId }, batch.id)
    batch.taskIds.push(task.id)

    const worker = this.workerFactory({
      parent: this.coordinator,
      request: workerRequest,
      agentId: task.agentId,
      persistence: this.persistence,
    })
    this.configureWorker?.(worker)
    this.registry.register(worker)
    this.attachWorker(worker, task.id)
    this.queue.push(task.id)
    this.emit({ type: 'agent_spawned', task })
    await this.persistManifest()
    this.drainQueue()
    this.scheduleBatchSeal()
    return this.tasks.get(task.id)!
  }

  async send(agentId: string, message: string): Promise<void> {
    const worker = this.registry.get(agentId)
    const previous = this.tasks.getByAgent(agentId)
    if (!worker || !previous) throw new Error(`Agent not found: ${agentId}`)
    if (this.worktreeSystem && !this.worktreeSystem.get(agentId)) {
      throw new Error(`Agent ${agentId} no longer has a worktree.`)
    }
    if (!message.trim()) throw new Error('Message cannot be empty.')
    if (worker.isBusy()) {
      throw new Error(`Agent ${agentId} is still running.`)
    }
    const batch = this.ensureOpenBatch()
    const task = this.tasks.create({
      parentAgentId: previous.parentAgentId,
      description: previous.description,
      prompt: message,
      role: previous.role,
    }, {
      taskId: createId('task'),
      agentId,
    }, batch.id)
    batch.taskIds.push(task.id)
    this.queuedPrompts.set(task.id, message)
    this.queue.push(task.id)
    this.emit({
      type: 'agent_status_changed',
      task: this.tasks.get(task.id)!,
    })
    this.drainQueue()
    await this.persistManifest()
    this.scheduleBatchSeal()
  }

  async stop(agentId: string): Promise<void> {
    const worker = this.registry.get(agentId)
    const task = this.tasks.getByAgent(agentId)
    if (!task) throw new Error(`Agent not found: ${agentId}`)
    if (
      task.status !== 'queued' &&
      task.status !== 'running'
    ) {
      throw new Error(`Cannot stop agent in ${task.status} state.`)
    }
    const queueIndex = this.queue.indexOf(task.id)
    if (queueIndex !== -1) this.queue.splice(queueIndex, 1)
    worker?.abort()
    this.clearTimer(task.id)
    const updated = this.tasks.update(task.id, {
      status: 'cancelled',
      error: 'Stopped by coordinator.',
      completedAt: Date.now(),
    })
    this.emit({ type: 'agent_status_changed', task: updated })
    await this.finishTask(updated)
    this.drainQueue()
  }

  async listWorktrees(): Promise<AgentWorktreeStatus[]> {
    if (!this.worktreeSystem) return []
    return Promise.all(
      this.worktreeSystem.list().map(async (worktree) =>
        this.decorateWorktreeStatus(
          await this.worktreeSystem!.status(worktree.agentId),
        )
      ),
    )
  }

  async getWorktreeStatus(agentId: string): Promise<AgentWorktreeStatus> {
    return this.decorateWorktreeStatus(
      await this.requireWorktreeSystem().status(agentId),
    )
  }

  async getWorktreeDiff(agentId: string): Promise<string> {
    return this.requireWorktreeSystem().diff(agentId)
  }

  async mergeWorktree(agentId: string): Promise<GitWorkTreeMergeResult> {
    const task = this.tasks.getByAgent(agentId)
    if (!task) throw new Error(`Agent not found: ${agentId}`)
    if (task?.status === 'queued' || task?.status === 'running') {
      throw new Error(
        `Agent ${agentId} is ${task.status}. Wait for its completion notification before merging.`,
      )
    }
    const result = await this.requireWorktreeSystem().merge(agentId)
    await this.persistManifest()
    return result
  }

  async removeWorktree(agentId: string, force = false): Promise<void> {
    const task = this.tasks.getByAgent(agentId)
    if (task?.status === 'queued' || task?.status === 'running') {
      throw new Error(`Agent ${agentId} is still running.`)
    }
    await this.requireWorktreeSystem().remove(agentId, force)
    await this.persistManifest()
  }

  async waitForBatch(
    batchId: string,
    options: {
      signal?: AbortSignal
      timeoutMs?: number
      onProgress?: (progress: {
        batchId: string
        completed: number
        total: number
        agents: Array<{ agentId: string; status: AgentTask['status'] }>
      }) => void
    } = {},
  ): Promise<Readonly<AgentTask>[]> {
    const batch = this.batches.get(batchId)
    if (!batch) throw new Error(`Agent batch not found: ${batchId}`)
    if (batch.status === 'open') {
      batch.status = 'sealed'
      batch.sealedAt = Date.now()
      if (this.currentCoordinatorTurnId === batch.coordinatorTurnId) {
        this.currentCoordinatorTurnId = undefined
      }
      void this.persistManifest()
    }

    const snapshot = () => batch.taskIds
      .map((taskId) => this.tasks.get(taskId))
      .filter((task): task is Readonly<AgentTask> => Boolean(task))
    const isTerminal = (task: Readonly<AgentTask>) =>
      task.status !== 'queued' && task.status !== 'running'
    const emitProgress = () => {
      const tasks = snapshot()
      options.onProgress?.({
        batchId,
        completed: tasks.filter(isTerminal).length,
        total: batch.taskIds.length,
        agents: tasks.map((task) => ({
          agentId: task.agentId,
          status: task.status,
        })),
      })
      return tasks
    }

    const current = emitProgress()
    if (current.length === batch.taskIds.length && current.every(isTerminal)) {
      this.tryDeliverBatch(batchId)
      return current
    }

    return new Promise<Readonly<AgentTask>[]>((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const cleanup = () => {
        unsubscribe()
        if (timer) clearTimeout(timer)
        options.signal?.removeEventListener('abort', onAbort)
      }
      const check = () => {
        const tasks = emitProgress()
        if (tasks.length === batch.taskIds.length && tasks.every(isTerminal)) {
          cleanup()
          this.tryDeliverBatch(batchId)
          resolve(tasks)
        }
      }
      const unsubscribe = this.subscribe((event) => {
        if ('task' in event && event.task.batchId === batchId) check()
      })
      const onAbort = () => {
        cleanup()
        reject(new Error(`Waiting for agent batch ${batchId} was cancelled.`))
      }
      options.signal?.addEventListener('abort', onAbort, { once: true })
      if (options.timeoutMs && options.timeoutMs > 0) {
        timer = setTimeout(() => {
          cleanup()
          reject(new Error(
            `Timed out waiting for agent batch ${batchId}. Agents continue running; wait again instead of polling.`,
          ))
        }, options.timeoutMs)
      }
      check()
    })
  }

  /** Permanently delete an agent and all its traces. */
  async delete(agentId: string): Promise<void> {
    const worker = this.registry.get(agentId)
    const task = this.tasks.getByAgent(agentId)
    if (!task) throw new Error(`Agent not found: ${agentId}`)

    // Abort if running, remove from queue.
    if (task.status === 'running' || task.status === 'queued') {
      worker?.abort()
      this.clearTimer(task.id)
      const queueIndex = this.queue.indexOf(task.id)
      if (queueIndex !== -1) this.queue.splice(queueIndex, 1)
    }

    // Remove subscriptions and registry entry.
    this.unsubscribers.get(agentId)?.()
    this.unsubscribers.delete(agentId)
    this.registry.remove(agentId)
    this.sleepingAgentMetas = this.sleepingAgentMetas.filter(
      (meta) => meta.agentId !== agentId,
    )

    // Emit final event before removal so TUI can update agent tree.
    if (task.status !== 'cancelled') {
      const updated = this.tasks.update(task.id, {
        status: 'cancelled',
        error: 'Deleted.',
        completedAt: Date.now(),
      })
      this.emit({ type: 'agent_status_changed', task: updated })
    }

    // Clear tracking maps and remove task record.
    this.toolHistory.delete(agentId)
    this.activities.delete(agentId)
    this.timers.delete(task.id)
    this.tasks.remove(task.id)

    // Remove from batch so tryDeliverBatch won't reference the missing task.
    const batch = this.batches.get(task.batchId)
    if (batch) {
      batch.taskIds = batch.taskIds.filter((id) => id !== task.id)
    }

    if (this.worktreeSystem?.get(agentId)) {
      await this.worktreeSystem.remove(agentId, true)
    }
    await this.persistManifest()
    this.drainQueue()
  }

  /** Stop all running and queued agents at once without restarting any. */
  async stopAll(): Promise<void> {
    const targets = this.tasks.list().filter(
      (task) => task.status === 'queued' || task.status === 'running',
    )
    // Clear queue first so drainQueue has nothing to start.
    this.queue.length = 0
    // Seal and mark delivered so finishTask won't feed results to coordinator.
    const batchIds = new Set(targets.map((t) => t.batchId))
    for (const batchId of batchIds) {
      const batch = this.batches.get(batchId)
      if (batch) {
        batch.status = 'sealed'
        batch.sealedAt = Date.now()
        this.batches.set(batchId, { ...batch, status: 'delivered' })
      }
    }
    for (const task of targets) {
      this.registry.get(task.agentId)?.abort()
      this.clearTimer(task.id)
      this.tasks.update(task.id, {
        status: 'cancelled',
        error: 'Stopped by user.',
        completedAt: Date.now(),
      })
    }
    for (const task of targets) {
      this.emit({ type: 'agent_status_changed', task: this.tasks.get(task.id)! })
      await this.finishTask(task)
    }
  }

  async shutdown(): Promise<void> {
    if (this.shuttingDown) return
    this.shuttingDown = true
    const active = this.tasks.list().filter((task) =>
      task.status === 'queued' ||
      task.status === 'running'
    )
    for (const task of active) {
      this.registry.get(task.agentId)?.abort()
      this.clearTimer(task.id)
      this.tasks.update(task.id, {
        status: 'interrupted',
        error: 'Interrupted during shutdown.',
        completedAt: Date.now(),
      })
    }
    await Promise.all(
      this.registry.list()
        .filter((agent) => agent.getId() !== this.coordinator.getId())
        .map((agent) => agent.waitForIdle()),
    )
    for (const unsubscribe of this.unsubscribers.values()) unsubscribe()
    this.unsubscribers.clear()
    if (this.sealTimer) clearTimeout(this.sealTimer)
    this.sealTimer = null
    for (const batch of this.batches.values()) {
      if (batch.status === 'open') {
        batch.status = 'sealed'
        batch.sealedAt = Date.now()
      }
    }
    this.coordinatorUnsubscribe?.()
    await this.persistManifest()
  }

  private drainQueue(): void {
    if (this.shuttingDown) return
    while (this.getRunningCount() < this.maxWorkers) {
      const taskId = this.queue.shift()
      if (!taskId) return
      const task = this.tasks.get(taskId)
      const worker = task ? this.registry.get(task.agentId) : undefined
      if (!task || !worker || task.status !== 'queued') continue
      this.tasks.setStatus(task.id, 'running')
      this.emit({
        type: 'agent_status_changed',
        task: this.tasks.get(task.id)!,
      })
      const prompt = this.queuedPrompts.get(task.id) ?? task.prompt
      this.queuedPrompts.delete(task.id)
      void this.runWorker(worker, task.id, prompt)
    }
  }

  private async runWorker(
    worker: MicrocodeAgent,
    taskId: string,
    prompt: string,
  ): Promise<void> {
    this.timers.set(taskId, setTimeout(() => {
      const current = this.tasks.get(taskId)
      if (!current || current.status !== 'running') return
      worker.abort()
      const failed = this.tasks.update(taskId, {
        status: 'failed',
        error: `Timed out after ${this.timeoutMs}ms.`,
        completedAt: Date.now(),
      })
      this.emit({ type: 'agent_failed', task: failed })
      void this.finishTask(failed)
      this.drainQueue()
    }, this.timeoutMs))

    try {
      await worker.prompt(prompt)
      const current = this.tasks.get(taskId)
      if (!current || current.status !== 'running') return
      const snapshot = worker.getTokenStats()
      const result = extractWorkerResult(worker.getMessages())
      const last = [...worker.getMessages()].reverse().find(
        (message): message is AssistantMessage => message.role === 'assistant',
      )
      if (last?.stopReason === 'error') {
        const failed = this.tasks.update(taskId, {
          status: 'failed',
          error: last.errorMessage ?? 'Worker failed.',
          completedAt: Date.now(),
          usage: { tokens: snapshot.session.totalTokens },
        })
        this.emit({ type: 'agent_failed', task: failed })
        await this.finishTask(failed)
      } else {
        const blockers = this.tasks.get(taskId)?.blockers ?? []
        const completed = this.tasks.update(taskId, {
          status: blockers.length > 0 ? 'blocked' : 'completed',
          result,
          completedAt: Date.now(),
          usage: { tokens: snapshot.session.totalTokens },
        })
        this.emit({
          type: blockers.length > 0 ? 'agent_blocked' : 'agent_completed',
          task: completed,
        })
        await this.finishTask(completed)
      }
    } catch (error) {
      const current = this.tasks.get(taskId)
      if (!current || current.status === 'cancelled' || current.status === 'failed') return
      const failed = this.tasks.update(taskId, {
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
        completedAt: Date.now(),
      })
      this.emit({ type: 'agent_failed', task: failed })
      await this.finishTask(failed)
    } finally {
      this.clearTimer(taskId)
      this.drainQueue()
    }
  }

  private attachWorker(worker: MicrocodeAgent, _taskId: string): void {
    const agentId = worker.getId()
    this.toolHistory.set(agentId, [])
    const unsubscribe = worker.subscribe((event) => {
      const task = this.tasks.getByAgent(agentId)
      const taskId = task?.id
      if (!taskId) return
      if (event.type === 'tool_started') {
        this.tasks.update(taskId, {
          usage: { toolCalls: task.usage.toolCalls + 1 },
        })
        const history = this.toolHistory.get(agentId) ?? []
        // tool_execution_start may have already created the entry; avoid duplicates.
        const exists = [...history].reverse().find(
          (h) => h.name === event.toolName && !h.done,
        )
        if (!exists) {
          history.push({ name: event.toolName, done: false, error: false })
          if (history.length > 12) history.shift()
          this.toolHistory.set(agentId, history)
        }
      }
      if (event.type === 'tool_execution_start') {
        const history = this.toolHistory.get(agentId) ?? []
        let entry = [...history].reverse().find(
          (h) => h.name === event.toolName && !h.detail,
        )
        if (!entry) {
          entry = { name: event.toolName, done: false, error: false }
          history.push(entry)
        }
        entry.detail = formatToolDetail(event.toolName, event.args as Record<string, unknown>)
        entry.startedAt = Date.now()
        entry.status = formatToolStatus(event.toolName, event.args as Record<string, unknown>) || entry.status
        this.toolHistory.set(agentId, history)
      }
      if (event.type === 'tool_execution_update') {
        const history = this.toolHistory.get(agentId) ?? []
        const entry = [...history].reverse().find(
          (h) => h.name === event.toolName && !h.done,
        )
        if (entry) {
          const pr = event.partialResult as any
          const status = formatToolStatus(
            event.toolName,
            event.args as Record<string, unknown>,
            pr?.details,
          )
          if (status) entry.status = status
        }
      }
      if (event.type === 'tool_finished') {
        const history = this.toolHistory.get(agentId) ?? []
        const entry = [...history].reverse().find(
          (h) => h.name === event.toolName && !h.done,
        )
        if (entry) {
          entry.done = true
          entry.error = event.isError
        }
      }
      // Emit on every tool state change so the TUI re-renders the tool tree immediately.
      if (
        event.type === 'tool_started' ||
        event.type === 'tool_execution_start' ||
        event.type === 'tool_execution_update' ||
        event.type === 'tool_finished'
      ) {
        const activity = event.type === 'tool_execution_start'
          ? formatToolActivity(event.toolName, event.args as Record<string, unknown>)
          : undefined
        if (activity) this.activities.set(worker.getId(), activity)
        this.emit({
          type: 'agent_activity',
          task: this.tasks.get(taskId)!,
          text: activity || '',
        })
      }
    })
    this.unsubscribers.set(worker.getId(), unsubscribe)
  }

  private async finishTask(task: Readonly<AgentTask>): Promise<void> {
    const worker = this.registry.get(task.agentId)
    if (worker) {
      await this.persistence?.saveAgentTranscript?.(
        task.agentId,
        worker.getMessages(),
      )
    }
    await this.persistManifest()
    this.tryDeliverBatch(task.batchId)
  }

  private tryDeliverBatch(batchId: string): void {
    const batch = this.batches.get(batchId)
    if (!batch || batch.status !== 'sealed') return
    const tasks = batch.taskIds
      .map((taskId) => this.tasks.get(taskId))
      .filter((task): task is Readonly<AgentTask> => Boolean(task))
    if (tasks.length !== batch.taskIds.length) return
    if (tasks.some((task) => task.status === 'queued' || task.status === 'running')) return

    batch.status = 'delivered'
    void this.persistManifest()
    const results = tasks.map((task) => this.serializeTaskResult(task)).join('\n')
    const notification = this.userMessage(
      `<agent-results batch-id="${this.xmlEscape(batch.id)}">\n${results}\n</agent-results>`,
    )
    if (this.coordinator.isBusy()) {
      this.coordinator.followUp(notification)
    } else if (!this.shuttingDown) {
      void this.coordinator.prompt(notification)
    }
  }

  private serializeTaskResult(task: Readonly<AgentTask>): string {
    const result = task.result
      ? `\n    <result>${this.xmlEscape(task.result)}</result>`
      : ''
    const error = task.error
      ? `\n    <error>${this.xmlEscape(task.error)}</error>`
      : ''
    const blockers = task.blockers.length > 0
      ? `\n    <blockers>\n${task.blockers.map((blocker) =>
          `      <blocker>\n` +
          `        <tool>${this.xmlEscape(blocker.toolName)}</tool>\n` +
          `        <reason>${this.xmlEscape(blocker.reason)}</reason>\n` +
          '      </blocker>'
        ).join('\n')}\n    </blockers>`
      : ''
    return `  <agent-result>\n    <task-id>${this.xmlEscape(task.id)}</task-id>\n` +
      `    <agent-id>${this.xmlEscape(task.agentId)}</agent-id>\n` +
      `    <status>${task.status}</status>${result}${error}${blockers}\n` +
      `    <usage tokens="${task.usage.tokens}" tool-calls="${task.usage.toolCalls}" />\n` +
      '  </agent-result>'
  }

  private attachCoordinator(): void {
    this.coordinatorUnsubscribe = this.coordinator.subscribe((event) => {
      if (event.type === 'agent_start') {
        this.currentCoordinatorTurnId = createId('turn')
      }
      if (
        event.type === 'agent_end' ||
        event.type === 'turn_end' ||
        event.type === 'tool_finished'
      ) {
        this.scheduleBatchSeal()
      }
    })
  }

  private ensureOpenBatch(): AgentBatch {
    const turnId = this.currentCoordinatorTurnId ?? createId('turn')
    this.currentCoordinatorTurnId ??= turnId
    const existing = [...this.batches.values()].find((batch) =>
      batch.coordinatorTurnId === turnId && batch.status === 'open'
    )
    if (existing) return existing
    const batch: AgentBatch = {
      id: createId('batch'),
      coordinatorTurnId: turnId,
      status: 'open',
      taskIds: [],
      createdAt: Date.now(),
    }
    this.batches.set(batch.id, batch)
    return batch
  }

  private scheduleBatchSeal(delayMs = 0): void {
    if (this.sealTimer) clearTimeout(this.sealTimer)
    this.sealTimer = setTimeout(() => {
      this.sealTimer = null
      if (this.coordinator.isBusy()) {
        this.scheduleBatchSeal(25)
        return
      }
      for (const batch of this.batches.values()) {
        if (batch.status === 'open') {
          batch.status = 'sealed'
          batch.sealedAt = Date.now()
          this.tryDeliverBatch(batch.id)
        }
      }
      this.currentCoordinatorTurnId = undefined
      void this.persistManifest()
    }, delayMs)
  }

  private xmlEscape(value: string): string {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;')
  }

  private userMessage(content: string): AgentMessage {
    return { role: 'user', content, timestamp: Date.now() }
  }

  private clearTimer(taskId: string): void {
    const timer = this.timers.get(taskId)
    if (timer) clearTimeout(timer)
    this.timers.delete(taskId)
  }

  private emit(event: SwarmUIEvent): void {
    for (const listener of this.listeners) listener(event)
  }

  private async persistManifest(): Promise<void> {
    const allMetas = this.collectAgentMetas()
    await this.persistence?.saveAgentManifest?.(
      this.tasks.list() as readonly AgentTask[],
      [...this.batches.values()].map((batch) => ({
        ...batch,
        taskIds: [...batch.taskIds],
      })),
      allMetas,
    )
  }

  private collectAgentMetas(): AgentMeta[] {
    const seen = new Set(this.sleepingAgentMetas.map((m) => m.agentId))
    const metas = [...this.sleepingAgentMetas]
    for (const agent of this.registry.list()) {
      if (agent.getId() === this.coordinator.getId()) continue
      if (seen.has(agent.getId())) continue
      const task = this.tasks.getByAgent(agent.getId())
      if (!task) continue
      seen.add(agent.getId())
      metas.push({
        agentId: agent.getId(),
        taskId: task.id,
        batchId: task.batchId,
        description: task.description,
        prompt: task.prompt,
        role: task.role,
        parentAgentId: task.parentAgentId,
        permissionMode: agent.getPermissionMode(),
        worktree: this.worktreeSystem?.get(agent.getId()),
      })
    }
    return metas
  }

  private requireWorktreeSystem(): GitWorkTreeSystem {
    if (!this.worktreeSystem) {
      throw new Error('Git worktree support is not configured.')
    }
    return this.worktreeSystem
  }

  private decorateWorktreeStatus(
    status: GitWorkTreeStatus,
  ): AgentWorktreeStatus {
    const task = this.tasks.getByAgent(status.agentId)
    const taskStatus = task?.status
    const phase = status.integratedAt
      ? 'merged'
      : taskStatus === 'queued'
        ? 'pending'
        : taskStatus === 'running'
          ? 'running'
          : taskStatus === 'completed'
            ? 'ready'
            : 'failed'
    return {
      ...status,
      taskStatus,
      phase,
      mergeable:
        phase === 'ready' && (status.changes.length > 0 || status.ahead > 0),
    }
  }
}
