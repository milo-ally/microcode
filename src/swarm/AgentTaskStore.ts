import type {
  AgentTask,
  AgentTaskStatus,
  SpawnAgentRequest,
} from './types.ts'

function cloneTask(task: AgentTask): AgentTask {
  return { ...task, usage: { ...task.usage } }
}

export class AgentTaskStore {
  private readonly tasks = new Map<string, AgentTask>()

  create(
    request: SpawnAgentRequest,
    ids: { taskId: string; agentId: string },
  ): Readonly<AgentTask> {
    if (this.tasks.has(ids.taskId)) {
      throw new Error(`Agent task already exists: ${ids.taskId}`)
    }
    const task: AgentTask = {
      id: ids.taskId,
      agentId: ids.agentId,
      parentAgentId: request.parentAgentId,
      description: request.description,
      prompt: request.prompt,
      role: request.role ?? 'worker',
      workKind: request.workKind ?? 'read',
      status: 'queued',
      createdAt: Date.now(),
      usage: { tokens: 0, toolCalls: 0 },
    }
    this.tasks.set(task.id, task)
    return cloneTask(task)
  }

  restore(tasks: readonly AgentTask[]): void {
    this.tasks.clear()
    for (const source of tasks) {
      const task = cloneTask(source)
      if (
        task.status === 'queued' ||
        task.status === 'running' ||
        task.status === 'waiting_permission'
      ) {
        task.status = 'interrupted'
        task.completedAt = Date.now()
        task.error = 'Interrupted when the previous session ended.'
      }
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
    const task = [...this.tasks.values()].find((item) => item.agentId === agentId)
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
      completedAt: ['completed', 'failed', 'cancelled', 'interrupted'].includes(status)
        ? now
        : task.completedAt,
    })
  }
}
