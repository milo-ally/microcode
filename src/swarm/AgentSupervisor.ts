import type { AgentMessage } from '@earendil-works/pi-agent-core'
import type { AssistantMessage } from '@earendil-works/pi-ai'
import type { MicrocodeAgent, MicrocodeAgentEvent } from '../agent/index.ts'
import { AgentRegistry } from './AgentRegistry.ts'
import { AgentTaskStore } from './AgentTaskStore.ts'
import { createWorkerAgent } from './AgentFactory.ts'
import type {
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
      return path ? `Reading ${path}` : 'Reading a file'
    case 'file_edit':
      return path ? `Editing ${path}` : 'Editing a file'
    case 'file_write':
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

export interface AgentSupervisorOptions {
  coordinator: MicrocodeAgent
  maxWorkers?: number
  maxHistory?: number
  timeoutMs?: number
  /** Debounce window in ms for batching agent result notifications (default 500). */
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
  private readonly timers = new Map<string, ReturnType<typeof setTimeout>>()
  private readonly unsubscribers = new Map<string, () => void>()
  private readonly delivered = new Set<string>()
  private readonly queuedPrompts = new Map<string, string>()
  private readonly pendingNotifications: Readonly<AgentTask>[] = []
  private notifyTimer: ReturnType<typeof setTimeout> | null = null
  private readonly notifyDebounceMs: number
  private shuttingDown = false

  constructor(options: AgentSupervisorOptions) {
    this.tasks = new AgentTaskStore({ maxHistory: options.maxHistory })
    this.coordinator = options.coordinator
    this.maxWorkers = Math.max(1, options.maxWorkers ?? 4)
    this.timeoutMs = Math.max(1, options.timeoutMs ?? 30 * 60 * 1000)
    this.notifyDebounceMs = Math.max(0, options.notifyDebounceMs ?? 500)
    this.persistence = options.persistence
    this.workerFactory = options.createWorker ?? createWorkerAgent
    this.configureWorker = options.configureWorker
    this.registry.register(this.coordinator)
  }

  async restore(): Promise<void> {
    const tasks = await this.persistence?.loadAgentManifest?.()
    if (tasks) {
      this.tasks.restore(tasks)
      await this.persistManifest()
    }
  }

  async prepareSessionSwitch(): Promise<void> {
    const active = this.tasks.list().filter((task) =>
      task.status === 'queued' ||
      task.status === 'running' ||
      task.status === 'waiting_permission'
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
    this.delivered.clear()
    this.queuedPrompts.clear()
    this.tasks.clear()
  }

  subscribe(listener: SwarmUIEventListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getMaxWorkers(): number {
    return this.maxWorkers
  }

  getTask(taskId: string): Readonly<AgentTask> | undefined {
    return this.tasks.get(taskId)
  }

  listAgents(): readonly AgentRuntimeState[] {
    return this.tasks.list().map((task) => ({
      task,
      identity: this.registry.get(task.agentId)?.getIdentity() ?? {
        id: task.agentId,
        name: task.description,
        role: task.role,
        parentId: task.parentAgentId,
      },
      activity: this.activities.get(task.agentId),
    }))
  }

  getRunningCount(): number {
    return this.tasks.list().filter((task) =>
      task.status === 'running' || task.status === 'waiting_permission'
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

    const task = this.tasks.create(request, {
      taskId: createId('task'),
      agentId: createId('agent'),
    })
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
    return this.tasks.get(task.id)!
  }

  async send(agentId: string, message: string): Promise<void> {
    const worker = this.registry.get(agentId)
    const task = this.tasks.getByAgent(agentId)
    if (!worker || !task) throw new Error(`Agent not found: ${agentId}`)
    if (!message.trim()) throw new Error('Message cannot be empty.')
    const followUp = this.userMessage(message)
    if (worker.isBusy()) {
      worker.followUp(followUp)
      return
    }
    // Re-queue idle or failed/cancelled agents so the coordinator can retry
    this.tasks.update(task.id, {
      status: 'queued',
      completedAt: undefined,
      error: undefined,
    })
    this.delivered.delete(task.id)
    this.queuedPrompts.set(task.id, message)
    this.queue.push(task.id)
    this.emit({
      type: 'agent_status_changed',
      task: this.tasks.get(task.id)!,
    })
    this.drainQueue()
  }

  async stop(agentId: string): Promise<void> {
    const worker = this.registry.get(agentId)
    const task = this.tasks.getByAgent(agentId)
    if (!task) throw new Error(`Agent not found: ${agentId}`)
    if (
      task.status !== 'queued' &&
      task.status !== 'running' &&
      task.status !== 'waiting_permission'
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
      task.status === 'running' ||
      task.status === 'waiting_permission'
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
    if (this.notifyTimer) clearTimeout(this.notifyTimer)
    this.notifyTimer = null
    // Flush any remaining pending notifications so the coordinator has final state
    this.flushNotifications()
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
          (other.status === 'running' || other.status === 'waiting_permission')
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
        const completed = this.tasks.update(taskId, {
          status: 'completed',
          result,
          completedAt: Date.now(),
          usage: { tokens: snapshot.session.totalTokens },
        })
        this.emit({ type: 'agent_completed', task: completed })
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

  private attachWorker(worker: MicrocodeAgent, taskId: string): void {
    const unsubscribe = worker.subscribe((event) => {
      const task = this.tasks.get(taskId)
      if (!task) return
      if (event.type === 'tool_started') {
        this.tasks.update(taskId, {
          usage: { toolCalls: task.usage.toolCalls + 1 },
        })
      }
      if (event.type === 'permission_requested') {
        const waiting = this.tasks.update(taskId, {
          status: 'waiting_permission',
        })
        this.emit({
          type: 'agent_permission_requested',
          task: waiting,
          toolName: event.request.toolName,
          description: event.request.description ?? event.request.toolName,
        })
      } else if (event.type === 'permission_resolved') {
        const current = this.tasks.get(taskId)
        if (current?.status === 'waiting_permission') {
          const running = this.tasks.update(taskId, { status: 'running' })
          this.emit({ type: 'agent_status_changed', task: running })
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
    this.scheduleNotification(task)
  }

  private scheduleNotification(task: Readonly<AgentTask>): void {
    if (this.delivered.has(task.id)) return
    this.delivered.add(task.id)
    this.pendingNotifications.push(task)
    if (this.notifyTimer) clearTimeout(this.notifyTimer)
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      this.flushNotifications()
    }, this.notifyDebounceMs)
  }

  private flushNotifications(): void {
    const batch = this.pendingNotifications.splice(0)
    if (batch.length === 0) return
    const results = batch.map((task) => {
      const result = task.result ? `\n  <result>${task.result}</result>` : ''
      const error = task.error ? `\n  <error>${task.error}</error>` : ''
      return `  <agent-result>\n    <task-id>${task.id}</task-id>\n    <agent-id>${task.agentId}</agent-id>\n    <status>${task.status}</status>${result}${error}\n    <usage tokens="${task.usage.tokens}" tool-calls="${task.usage.toolCalls}" />\n  </agent-result>`
    }).join('\n')
    const notification = this.userMessage(
      `<agent-results>\n${results}\n</agent-results>`,
    )
    if (this.coordinator.isBusy()) {
      this.coordinator.followUp(notification)
    } else if (!this.shuttingDown) {
      void this.coordinator.prompt(notification)
    }
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
    )
  }
}
