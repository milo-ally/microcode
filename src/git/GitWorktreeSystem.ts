import { simpleGit, type SimpleGit } from 'simple-git'
import { join } from 'path'
import { existsSync } from 'fs'
import { mkdir, rm } from 'fs/promises'

const WORKTREE_PREFIX = 'microcode'

export interface WorktreeState {
  agentId: string
  path: string
  branch: string
  baseBranch: string
  createdAt: number
}

export class GitWorktreeSystem {
  private readonly root: string
  private readonly mainGit: SimpleGit

  constructor(
    private readonly repoPath: string,
    worktreesRoot?: string,
  ) {
    this.root = worktreesRoot ?? join(repoPath, '.microcode', 'worktrees')
    this.mainGit = simpleGit(repoPath)
  }

  static async isGitRepo(cwd: string): Promise<boolean> {
    try {
      const git = simpleGit(cwd)
      const top = await git.revparse(['--show-toplevel'])
      return !!top
    } catch {
      return false
    }
  }

  /**
   * Create a worktree for an agent, return the worktree path.
   *
   * Git worktree only checks out tracked files — untracked/ignored files
   * (node_modules, dist, .env, build artifacts) never land in the worktree.
   * The .git directory is shared via the main repo's object database.
   * Disk overhead per agent is limited to the size of version-controlled sources.
   */
  async createWorktree(agentId: string, baseRef?: string): Promise<WorktreeState> {
    const branch = `${WORKTREE_PREFIX}/${agentId}`
    const worktreePath = join(this.root, agentId)

    await mkdir(this.root, { recursive: true })

    const base = baseRef ?? (await this.mainGit.revparse(['--abbrev-ref', 'HEAD'])).trim()

    await this.mainGit.branch([branch, base])
    await this.mainGit.raw(['worktree', 'add', worktreePath, branch])

    return {
      agentId,
      path: worktreePath,
      branch,
      baseBranch: base,
      createdAt: Date.now(),
    }
  }

  /** Commit all changes in the worktree. Returns the commit hash. */
  async commitWorktree(agentId: string, message: string): Promise<string> {
    const worktreePath = join(this.root, agentId)
    if (!existsSync(worktreePath)) {
      throw new Error(`Worktree not found: ${agentId}`)
    }
    const git = simpleGit(worktreePath)
    await git.add('.')
    const result = await git.commit(message)
    return result.commit || ''
  }

  /** Merge the worktree branch back to target branch. */
  async mergeWorktree(agentId: string, targetBranch?: string): Promise<string> {
    const worktrees = await this.listWorktrees()
    const state = worktrees.find(w => w.agentId === agentId)
    if (!state) throw new Error(`Worktree state not found: ${agentId}`)

    const target = targetBranch ?? state.baseBranch

    await this.mainGit.checkout(target)
    const result = await this.mainGit.merge([state.branch])

    try {
      await this.mainGit.branch(['-d', state.branch])
    } catch {
      // Branch might already be gone, ignore
    }

    return result.result || 'merged'
  }

  /** Remove worktree directory and branch. */
  async cleanupWorktree(agentId: string): Promise<void> {
    const worktreePath = join(this.root, agentId)
    if (!existsSync(worktreePath)) return

    try {
      await this.mainGit.raw(['worktree', 'remove', worktreePath, '--force'])
    } catch {
      // Directory might already be gone
    }

    try {
      await rm(worktreePath, { recursive: true, force: true })
    } catch {
      // Ignore cleanup errors
    }
  }

  /** List all active worktrees. */
  async listWorktrees(): Promise<WorktreeState[]> {
    if (!existsSync(this.root)) return []
    const result: WorktreeState[] = []
    const raw = await this.mainGit.raw(['worktree', 'list', '--porcelain'])
    let current: Partial<WorktreeState> = {}
    for (const line of raw.split('\n')) {
      if (line.startsWith('worktree ')) {
        if (current.path && current.agentId) result.push(current as WorktreeState)
        current = { createdAt: 0 }
        const p = line.slice(9)
        current.path = p
        const parts = p.split('/')
        current.agentId = parts[parts.length - 1]
      } else if (line.startsWith('branch ')) {
        current.branch = line.slice(19)
      }
    }
    if (current.path && current.agentId) result.push(current as WorktreeState)
    return result.filter(s => s.path?.startsWith(this.root))
  }
}
