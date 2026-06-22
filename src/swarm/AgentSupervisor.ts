import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { MicrocodeAgent, MicrocodeAgentEvent } from '../agent/index.ts'
import { AgentRegistry } from './AgentRegistry.ts'
import { AgentTaskStore } from './AgentTaskStore.ts'
import { createWorkerAgent } from './AgentFactory.ts'
import { getWorkerCapabilities } from './AgentFactory.ts'
import type { AgentCapability } from '../permissions/index.ts'
import type {
  AgentBatch,
  AgentRuntimeState,
  AgentTask,
  AgentTranscriptPersistence,
  SwarmUIEvent,
  SwarmUIEventListener,
  SpawnAgentRequest,
} from './types.ts'

function createId(prefix: string): string {
  return `${prefix}-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
}

function extractAssistantText(messages: readonly AgentMessage[]): string {
  const assistant = [...messages].reverse().find(
    (message): message is AssistantMessage => message.role === 'assistant',
  )
  if (!assistant) return ''
  return assistant.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n')
    .trim()
}

function describeActivity(event: MicrocodeAgentEvent): string | undefined {
  if (event.type !== 'tool_execution_start') return undefined
  const args = event.args as Record<string, unknown>
  const path = typeof args.path === 'string'
    ? args.path
    : typeof args.file_path === 'string'
      ? args.file_path
      : undefined
  switch (event.toolName) {
    case 'file_read':
    case 'read':
      return path ? `Reading ${path}` : 'Reading a file'
    case 'file_edit':
    case 'edit':
      return path ? `Editing ${path}` : 'Editing a file'
    case 'file_write':
    case 'write':
      return path ? `Writing ${path}` : 'Writing a file'
    case 'grep':
      return typeof args.pattern === 'string'
        ? `Searching for ${args.pattern}`
        : 'Searching the codebase'
    case 'glob':
      return 'Finding files'
    case 'bash':
      return 'Running a command'
    default:
      return `Using ${event.toolName}`
  }
}

function toolDetail(toolName: string, args: Record<string, unknown>): string {
  switch (toolName) {
    case 'bash': {
      const cmd = typeof args.command === 'string' ? args.command : ''
      const preview = cmd.length > 40 ? `${cmd.slice(0, 40)}…` : cmd
      return preview || 'bash'
    }
    case 'file_read':
    case 'read': {
      const p = typeof args.file_path === 'string' ? args.file_path : ''
      return basename(p) || 'file'
    }
    case 'file_edit':
    case 'edit': {
      const p = typeof args.file_path === 'string' ? args.file_path : ''
      return basename(p) || 'edit'
    }
    case 'file_write':
    case 'write': {
      const p = typeof args.file_path === 'string' ? args.file_path : ''
      return basename(p) || 'write'
    }
    case 'grep': {
      const pattern = typeof args.pattern === 'string' ? args.pattern : ''
      const preview = pattern.length > 30 ? `${pattern.slice(0, 30)}…` : pattern
      return preview || 'grep'
    }
    case 'glob':
      return typeof args.pattern === 'string' ? args.pattern : 'glob'
    default:
      return ''
  }
}

function basename(p: string): string {
  const s = p.split('/').pop() ?? p
  return s || p
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
  private readonly listeners = new Set<SwarmUIEventListener>()
  private readonly queue: string[] = []
  private readonly activities = new Map<string, string>()
  private readonly toolHistory = new Map<string, { name: string; done: boolean; error: boolean; detail?: string }[]>()
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly unsubscribers = new Map<string, () => void>()
  private readonly queuedPrompts = new Map<string, string>()
  private readonly batches = new Map<string, AgentBatch>()
  private readonly sessionCapabilityGrants = new Set<AgentCapability>()
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
    this.registry.register(this.coordinator)
    this.attachCoordinator()
  }

  async restore(): Promise<void> {
    const tasks = await this.persistence?.loadAgentManifest?.()
    const batches = await this.persistence?.loadAgentBatches?.()
    if (tasks) {
      this.tasks.restore(tasks)
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
  }

  async prepareSessionSwitch(): Promise<void> {
    const active = this.tasks.list().filter((task) =>
      task.status === 'queued' ||
      task.status === 'running'
    )
    for (const task of active) {
      this.registry.get(task.agentId)?.abort()
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

  subscribe(listener: SwarmUIEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** Push parent permission rules (and optionally mode) to all worker agents. */
  syncPermissionsToWorkers(updateMode = false): void {
    const snapshot = this.coordinator.getPermissionSnapshot()
    for (const agent of this.registry.list()) {
      if (agent.getId() === this.coordinator.getId()) continue
      const task = this.tasks.getByAgent(agent.getId())
      if (!task) continue
      agent.inheritPermissions(snapshot, [], updateMode)
      agent.setCapabilities(getWorkerCapabilities({
        parent: this.coordinator,
        request: {
          parentAgentId: task.parentAgentId,
          description: task.description,
          prompt: task.prompt,
          role: task.role,
          workKind: task.workKind,
        },
        agentId: task.agentId,
      }, this.sessionCapabilityGrants))
      agent.setApprovedCapabilities(this.sessionCapabilityGrants)
    }
  }

  grantSessionCapabilities(capabilities: readonly AgentCapability[]): AgentCapability[] {
    const parentCapabilities = new Set(
      this.coordinator.getPermissionSnapshot().capabilities,
    )
    const granted = capabilities.filter((capability) => parentCapabilities.has(capability))
    for (const capability of granted) this.sessionCapabilityGrants.add(capability)
    this.syncPermissionsToWorkers(false)
    return granted
  }

  getGrantableCapabilities(): AgentCapability[] {
    const blocked = new Set<AgentCapability>()
    for (const task of this.tasks.list()) {
      for (const blocker of task.blockers) blocked.add(blocker.requiredCapability)
    }
    const parentCapabilities = new Set(
      this.coordinator.getPermissionSnapshot().capabilities,
    )
    return [...blocked].filter((capability) =>
      parentCapabilities.has(capability) &&
      !this.sessionCapabilityGrants.has(capability)
    )
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

    const batch = this.ensureOpenBatch()
    const task = this.tasks.create(request, {
      taskId: createId('task'),
      agentId: createId('agent'),
    }, batch.id)
    batch.taskIds.push(task.id)
    const worker = this.workerFactory({
      parent: this.coordinator,
      request,
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
      workKind: previous.workKind,
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
      const index = this.queue.findIndex((taskId) => {
        const task = this.tasks.get(taskId)
        if (!task) return false
        if (task.workKind !== 'write') return true
        return !this.tasks.list().some((other) =>
          other.id !== task.id &&
          other.workKind === 'write' &&
          other.status === 'running'
        )
      })
      if (index === -1) return
      const [taskId] = this.queue.splice(index, 1)
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
      const result = extractAssistantText(worker.getMessages())
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
        history.push({ name: event.toolName, done: false, error: false })
        if (history.length > 12) history.shift()
        this.toolHistory.set(agentId, history)
      }
      if (event.type === 'tool_execution_start') {
        const history = this.toolHistory.get(agentId) ?? []
        const entry = [...history].reverse().find(
          (h) => h.name === event.toolName && !h.detail,
        )
        if (entry) entry.detail = toolDetail(event.toolName, event.args as Record<string, unknown>)
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
      if (event.type === 'permission_requested') {
        this.emit({
          type: 'agent_permission_requested',
          task,
          toolName: event.request.toolName,
          description: event.request.description ?? event.request.toolName,
        })
      } else if (event.type === 'permission_blocked') {
        const current = this.tasks.get(taskId)
        if (current) {
          const duplicate = current.blockers.some((blocker) =>
            blocker.toolName === event.blocker.toolName &&
            blocker.operation === event.blocker.operation &&
            blocker.requiredCapability === event.blocker.requiredCapability
          )
          const blocked = duplicate
            ? current
            : this.tasks.update(taskId, {
                blockers: [...current.blockers, { ...event.blocker }],
              })
          this.emit({
            type: 'agent_permission_blocked',
            task: blocked,
            blocker: event.blocker,
          })
        }
      }
      const activity = describeActivity(event)
      if (activity) {
        this.activities.set(worker.getId(), activity)
        this.emit({ type: 'agent_activity', task: this.tasks.get(taskId)!, text: activity })
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
          `      <blocker type="permission" capability="${this.xmlEscape(blocker.requiredCapability)}" retryable="${blocker.retryable}">\n` +
          `        <tool>${this.xmlEscape(blocker.toolName)}</tool>\n` +
          `        <operation>${this.xmlEscape(blocker.operation)}</operation>\n` +
          `        <reason>${this.xmlEscape(blocker.reason)}</reason>\n` +
          `        <input>${this.xmlEscape(blocker.inputSummary)}</input>\n` +
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

  private scheduleBatchSeal(): void {
    if (this.sealTimer) clearTimeout(this.sealTimer)
    this.sealTimer = setTimeout(() => {
      this.sealTimer = null
      if (this.coordinator.isBusy()) return
      for (const batch of this.batches.values()) {
        if (batch.status === 'open') {
          batch.status = 'sealed'
          batch.sealedAt = Date.now()
          this.tryDeliverBatch(batch.id)
        }
      }
      this.currentCoordinatorTurnId = undefined
      void this.persistManifest()
    }, 0)
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
    await this.persistence?.saveAgentManifest?.(
      this.tasks.list() as readonly AgentTask[],
      [...this.batches.values()].map((batch) => ({
        ...batch,
        taskIds: [...batch.taskIds],
      })),
    )
  }
}
