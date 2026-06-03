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

const SESSIONS_DIR = path.join(os.homedir(), '.microcode', 'sessions')
const TITLES_FILE = path.join(SESSIONS_DIR, '.titles.json')

export interface SessionListItem extends JsonlSessionMetadata {
  title?: string
}

/**
 * Manages session lifecycle: create, persist, resume, list.
 * Wraps pi-agent-core's JsonlSessionRepo and Session.
 */
export class SessionManager {
  private repo: JsonlSessionRepo
  private session: Session | null = null
  private metadata: JsonlSessionMetadata | null = null
  private savedMessageCount = 0
  private titleCache: Map<string, string> | null = null

  constructor() {
    const fs = new NodeFileSystem('/')
    this.repo = new JsonlSessionRepo({
      fs,
      sessionsRoot: SESSIONS_DIR,
    })
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
  async saveMessages(messages: AgentMessage[]): Promise<void> {
    if (!this.session) return

    // Append only new messages, with image blocks replaced by text references
    for (let i = this.savedMessageCount; i < messages.length; i++) {
      const serialized = replaceImageBlocksForPersistence(messages[i])
      await this.session.appendMessage(serialized)
    }
    this.savedMessageCount = messages.length
  }

  /**
   * Record a compaction event in the session.
   */
  async saveCompaction(
    summary: string,
    firstKeptEntryId: string,
    tokensBefore: number,
  ): Promise<void> {
    if (!this.session) return
    await this.session.appendCompaction(summary, firstKeptEntryId, tokensBefore)
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
   * Get the current session instance.
   */
  getSession(): Session | null {
    return this.session
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

  /**
   * Delete a session.
   */
  async delete(meta: JsonlSessionMetadata): Promise<void> {
    await this.repo.delete(meta)
  }

  /**
   * Reset saved message count (e.g., after compaction replaces all messages).
   */
  resetSavedCount(): void {
    this.savedMessageCount = 0
  }

  /**
   * Set saved message count to a specific value.
   * Use after compaction to avoid re-saving messages that are already in the session.
   */
  setSavedMessageCount(count: number): void {
    this.savedMessageCount = count
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
   * Saves the current session first.
   */
  async switchToSession(meta: JsonlSessionMetadata, currentMessages: AgentMessage[]): Promise<AgentMessage[]> {
    // Save current session
    if (this.session) {
      await this.saveMessages(currentMessages)
    }

    // Load target session
    this.session = await this.repo.open(meta)
    this.metadata = meta
    const context = await this.session.buildContext()
    this.savedMessageCount = context.messages.length
    return context.messages
  }
}
