import * as path from 'path'
import * as os from 'os'
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import {
  JsonlSessionRepo,
  Session,
  type JsonlSessionMetadata,
  type AgentMessage,
} from '@earendil-works/pi-agent-core'
import { NodeFileSystem } from './NodeFileSystem.ts'
import { replaceImageBlocksForPersistence } from './imageSerializer.ts'
import type {
  AgentCompactionRecord,
  AgentSessionPersistence,
} from '../agent/persistence.ts'
import {
  TaskSystem,
  type TaskList,
  type TaskMarkUpdate,
  type TaskReminderUpdate,
} from '../tasks/TaskSystem.ts'

const SESSIONS_DIR = path.join(os.homedir(), '.microcode', 'sessions')
const TITLES_FILE = path.join(SESSIONS_DIR, '.titles.json')
const TASKS_DIR = path.join(SESSIONS_DIR, '.tasks')

export interface SessionListItem extends JsonlSessionMetadata {
  title?: string
}

/**
 * Manages session lifecycle: create, persist, resume, list.
 * Wraps pi-agent-core's JsonlSessionRepo and Session.
 */
export class SessionManager implements AgentSessionPersistence {
  private repo: JsonlSessionRepo
  private session: Session | null = null
  private metadata: JsonlSessionMetadata | null = null
  private savedMessageCount = 0
  private titleCache: Map<string, string> | null = null
  private readonly taskSystem: TaskSystem

  constructor(options: { tasksRoot?: string } = {}) {
    const fs = new NodeFileSystem('/')
    this.repo = new JsonlSessionRepo({
      fs,
      sessionsRoot: SESSIONS_DIR,
    })
    this.taskSystem = new TaskSystem(options.tasksRoot ?? TASKS_DIR)
  }

  /**
   * Create a new session for the given working directory.
   */
  async create(cwd: string): Promise<string> {
    this.session = await this.repo.create({ cwd })
    this.metadata = await this.session.getMetadata() as JsonlSessionMetadata
    this.savedMessageCount = 0
    return this.metadata.id
  }

  /**
   * Resume an existing session from metadata.
   */
  async open(meta: JsonlSessionMetadata): Promise<AgentMessage[]> {
    this.session = await this.repo.open(meta)
    this.metadata = meta
    const context = await this.session.buildContext()
    this.savedMessageCount = context.messages.length
    return context.messages
  }

  /**
   * List available sessions, optionally filtered by cwd.
   */
  async list(cwd?: string): Promise<JsonlSessionMetadata[]> {
    return this.repo.list({ cwd })
  }

  /**
   * Get the most recent session for a given cwd, if any.
   */
  async getLatestSession(cwd: string): Promise<JsonlSessionMetadata | null> {
    const sessions = await this.list(cwd)
    return sessions[0] ?? null
  }

  /**
   * Persist new messages to the session.
   * Only appends messages that haven't been saved yet.
   */
  async saveMessages(messages: readonly AgentMessage[]): Promise<void> {
    if (!this.session) return

    // Append only new messages, with image blocks replaced by text references
    for (let i = this.savedMessageCount; i < messages.length; i++) {
      const serialized = replaceImageBlocksForPersistence(messages[i])
      await this.session.appendMessage(serialized)
    }
    this.savedMessageCount = messages.length
  }

  async recordCompaction(record: AgentCompactionRecord): Promise<void> {
    if (!this.session) return
    const entries = await this.session.getBranch()
    const messageEntries = entries.filter((entry) => entry.type === 'message')
    if (messageEntries.length === 0) {
      throw new Error('No persisted messages available for compaction.')
    }
    const keptCount = Math.min(record.keptMessageCount, messageEntries.length)
    const firstKeptEntry = messageEntries[
      Math.max(0, messageEntries.length - keptCount)
    ]
    // A fully malformed trailing tool interaction may be summarized without
    // retaining any original messages. The session builder treats an unknown
    // boundary ID as "summary only", which is the desired representation.
    const firstKeptEntryId =
      firstKeptEntry?.id ?? `compacted-summary-only-${Date.now()}`
    await this.session.appendCompaction(
      record.summary,
      firstKeptEntryId,
      record.tokensBefore,
      {
        tokensAfter: record.tokensAfter,
        automatic: record.automatic,
      },
      record.automatic,
    )
    this.savedMessageCount = record.compactedMessageCount
  }

  /**
   * Load all messages from the session.
   */
  async loadMessages(): Promise<AgentMessage[]> {
    if (!this.session) return []
    const context = await this.session.buildContext()
    return context.messages
  }

  /**
   * Get the current session metadata.
   */
  getMetadata(): JsonlSessionMetadata | null {
    return this.metadata
  }

  /**
   * Get the session ID.
   */
  getSessionId(): string | null {
    return this.metadata?.id ?? null
  }

  async createTaskList(title: string, tasks: readonly string[]): Promise<TaskList> {
    return this.taskSystem.createList(this.requireSessionId(), title, tasks)
  }

  async listTaskLists(): Promise<TaskList[]> {
    return this.taskSystem.listTaskLists(this.requireSessionId())
  }

  async getTaskReminder(): Promise<string | undefined> {
    return this.taskSystem.getReminder(this.requireSessionId())
  }

  async claimTaskList(listId: string): Promise<TaskList> {
    return this.taskSystem.claimTaskList(this.requireSessionId(), listId)
  }

  async remindTask(listId: string, taskId: string, reminder = true): Promise<TaskList> {
    return this.taskSystem.remindTask(this.requireSessionId(), listId, taskId, reminder)
  }

  async remindTasks(
    listId: string,
    tasks: readonly TaskReminderUpdate[],
  ): Promise<TaskList> {
    return this.taskSystem.remindTasks(this.requireSessionId(), listId, tasks)
  }

  async markTask(
    listId: string | undefined,
    taskId: string,
    completed: boolean,
    pending?: boolean,
  ): Promise<TaskList> {
    return this.taskSystem.markTask(
      this.requireSessionId(),
      listId,
      taskId,
      completed,
      pending,
    )
  }

  async markTasks(input: {
    list_id?: string
    tasks: readonly TaskMarkUpdate[]
  }): Promise<TaskList> {
    return this.taskSystem.markTasks(this.requireSessionId(), input)
  }

  private requireSessionId(): string {
    const sessionId = this.getSessionId()
    if (!sessionId) throw new Error('No active session.')
    return sessionId
  }

  /**
   * Delete a session.
   */
  async delete(meta: JsonlSessionMetadata): Promise<void> {
    await this.repo.delete(meta)
  }

  /**
   * Load the titles map from disk into cache.
   */
  private loadTitles(): void {
    if (this.titleCache) return
    try {
      if (existsSync(TITLES_FILE)) {
        const raw = readFileSync(TITLES_FILE, 'utf-8')
        const data = JSON.parse(raw)
        this.titleCache = new Map(Object.entries(data))
      } else {
        this.titleCache = new Map()
      }
    } catch {
      this.titleCache = new Map()
    }
  }

  /**
   * Save the titles cache back to disk.
   */
  private saveTitles(): void {
    try {
      const dir = path.dirname(TITLES_FILE)
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true })
      }
      const data = Object.fromEntries(this.titleCache ?? new Map())
      writeFileSync(TITLES_FILE, JSON.stringify(data, null, 2))
    } catch {}
  }

  /**
   * Set the title for a session.
   */
  setTitle(sessionId: string, title: string): void {
    this.loadTitles()
    this.titleCache!.set(sessionId, title)
    this.saveTitles()
  }

  /**
   * Get the title for a session.
   */
  getTitle(sessionId: string): string | undefined {
    this.loadTitles()
    return this.titleCache?.get(sessionId)
  }

  /**
   * List sessions enriched with titles.
   */
  async listWithTitles(cwd?: string): Promise<SessionListItem[]> {
    const sessions = await this.repo.list({ cwd })
    this.loadTitles()
    return sessions.map((s) => ({
      ...s,
      title: this.titleCache?.get(s.id),
    }))
  }

  /**
   * Switch to a different session, returning its messages.
   * The caller is responsible for persisting the current runtime first.
   */
  async switchToSession(meta: JsonlSessionMetadata): Promise<AgentMessage[]> {
    this.session = await this.repo.open(meta)
    this.metadata = meta
    const context = await this.session.buildContext()
    this.savedMessageCount = context.messages.length
    return context.messages
  }
}
