import type {
  AgentTask,
  AgentTaskStatus,
  SpawnAgentRequest,
} from './types.ts'

function cloneTask(task: AgentTask): AgentTask {
  return {
    ...task,
    blockers: (task.blockers ?? []).map((blocker) => ({ ...blocker })),
    usage: { ...task.usage },
  }
}

const TERMINAL_STATUSES: ReadonlySet<AgentTaskStatus> = new Set([
  'completed',
  'blocked',
  'failed',
  'cancelled',
  'interrupted',
])

export class AgentTaskStore {
  private readonly tasks = new Map<string, AgentTask>()
  private readonly maxHistory: number

  constructor(options: { maxHistory?: number } = {}) {
    this.maxHistory = options.maxHistory ?? 50
  }

  create(
    request: SpawnAgentRequest,
    ids: { taskId: string; agentId: string },
    batchId = 'legacy-batch',
  ): Readonly<AgentTask> {
    if (this.tasks.has(ids.taskId)) {
      throw new Error(`Agent task already exists: ${ids.taskId}`)
    }
    const task: AgentTask = {
      id: ids.taskId,
      batchId,
      agentId: ids.agentId,
      parentAgentId: request.parentAgentId,
      description: request.description,
      prompt: request.prompt,
      role: request.role ?? 'worker',
      status: 'queued',
      blockers: [],
      createdAt: Date.now(),
      usage: { tokens: 0, toolCalls: 0 },
    }
    this.tasks.set(task.id, task)
    this.evict(new Set([batchId]))
    return cloneTask(task)
  }

  private evict(protectedBatchIds: ReadonlySet<string>): void {
    if (this.tasks.size <= this.maxHistory) return
    const terminal = [...this.tasks.values()]
      .filter((task) =>
        TERMINAL_STATUSES.has(task.status) &&
        !protectedBatchIds.has(task.batchId)
      )
      .sort((a, b) => a.createdAt - b.createdAt)
    const toRemove = this.tasks.size - this.maxHistory
    for (let i = 0; i < toRemove && i < terminal.length; i++) {
      this.tasks.delete(terminal[i].id)
    }
  }

  restore(tasks: readonly AgentTask[]): void {
    this.tasks.clear()
    for (const source of tasks) {
      const task = cloneTask(source)
      if (
        task.status === 'queued' ||
        task.status === 'running' ||
        (task.status as string) === 'waiting_permission'
      ) {
        task.status = 'interrupted'
        task.completedAt = Date.now()
        task.error = 'Interrupted when the previous session ended.'
      }
      task.batchId ??= 'legacy-batch'
      task.blockers ??= []
      this.tasks.set(task.id, task)
    }
  }

  clear(): void {
    this.tasks.clear()
  }

  get(taskId: string): Readonly<AgentTask> | undefined {
    const task = this.tasks.get(taskId)
    return task ? cloneTask(task) : undefined
  }

  getByAgent(agentId: string): Readonly<AgentTask> | undefined {
    const task = [...this.tasks.values()]
      .filter((item) => item.agentId === agentId)
      .sort((a, b) => b.createdAt - a.createdAt)[0]
    return task ? cloneTask(task) : undefined
  }

  list(): readonly Readonly<AgentTask>[] {
    return [...this.tasks.values()].map(cloneTask)
  }

  update(
    taskId: string,
    patch: Partial<Omit<AgentTask, 'id' | 'agentId' | 'usage'>> & {
      usage?: Partial<AgentTask['usage']>
    },
  ): Readonly<AgentTask> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Agent task not found: ${taskId}`)
    const { usage, ...rest } = patch
    Object.assign(task, rest)
    if (usage) Object.assign(task.usage, usage)
    return cloneTask(task)
  }

  setStatus(taskId: string, status: AgentTaskStatus): Readonly<AgentTask> {
    const task = this.tasks.get(taskId)
    if (!task) throw new Error(`Agent task not found: ${taskId}`)
    const now = Date.now()
    return this.update(taskId, {
      status,
      startedAt: status === 'running' ? task.startedAt ?? now : task.startedAt,
      completedAt: ['completed', 'blocked', 'failed', 'cancelled', 'interrupted'].includes(status)
        ? now
        : task.completedAt,
    })
  }
}
