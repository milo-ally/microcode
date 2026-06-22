import { createHash } from 'crypto'
import { execFile } from 'child_process'
import { access, mkdir } from 'fs/promises'
import { homedir } from 'os'
import { basename, join, resolve } from 'path'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface GitWorkTree {
  agentId: string
  path: string
  branch: string
  baseCommit: string
  createdAt: number
  integratedAt?: number
}

export interface GitWorkTreeStatus extends GitWorkTree {
  changes: string[]
  ahead: number
}

export interface GitWorkTreeMergeResult {
  merged: boolean
  commit?: string
  message: string
}

export interface GitWorkTreeSystemOptions {
  worktreesRoot?: string
}

function commandError(error: unknown): string {
  const value = error as { stderr?: string; stdout?: string; message?: string }
  return value.stderr?.trim() || value.stdout?.trim() || value.message || String(error)
}

function isMissingCommand(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

export class GitWorkTreeSystem {
  readonly repositoryRoot: string
  readonly worktreesRoot: string
  private readonly worktrees = new Map<string, GitWorkTree>()

  private constructor(repositoryRoot: string, options: GitWorkTreeSystemOptions) {
    this.repositoryRoot = repositoryRoot
    const repoKey = createHash('sha256').update(repositoryRoot).digest('hex').slice(0, 12)
    this.worktreesRoot = options.worktreesRoot
      ? resolve(options.worktreesRoot)
      : join(homedir(), '.microcode', 'worktrees', `${basename(repositoryRoot)}-${repoKey}`)
  }

  static async open(
    cwd: string,
    options: GitWorkTreeSystemOptions = {},
  ): Promise<GitWorkTreeSystem> {
    try {
      await execFileAsync('git', ['--version'])
    } catch (error) {
      if (isMissingCommand(error)) {
        throw new Error(
          'Git is required to run microcode. Install Git and make sure the "git" command is available in PATH.',
        )
      }
      throw new Error(`Unable to run Git: ${commandError(error)}`)
    }

    let repositoryRoot: string
    try {
      const result = await execFileAsync(
        'git',
        ['rev-parse', '--show-toplevel'],
        { cwd },
      )
      repositoryRoot = result.stdout.trim()
    } catch {
      throw new Error(
        `Microcode must run inside a Git repository so agents can use isolated worktrees: ${cwd}`,
      )
    }

    return new GitWorkTreeSystem(repositoryRoot, options)
  }

  async create(agentId: string): Promise<GitWorkTree> {
    const existing = this.worktrees.get(agentId)
    if (existing) return { ...existing }
    this.assertAgentId(agentId)
    await this.assertMainWorkspaceClean()
    await mkdir(this.worktreesRoot, { recursive: true })

    const baseCommit = (await this.git(['rev-parse', 'HEAD'])).trim()
    const branch = `microcode/${agentId}`
    const path = join(this.worktreesRoot, agentId)

    try {
      await access(path)
      throw new Error(`Worktree path already exists: ${path}`)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
    }

    try {
      await this.git(['worktree', 'add', '-b', branch, path, baseCommit])
    } catch (error) {
      throw new Error(`Failed to create worktree for ${agentId}: ${commandError(error)}`)
    }

    const worktree: GitWorkTree = {
      agentId,
      path,
      branch,
      baseCommit,
      createdAt: Date.now(),
    }
    this.worktrees.set(agentId, worktree)
    return { ...worktree }
  }

  async restore(worktree: GitWorkTree): Promise<GitWorkTree> {
    this.assertAgentId(worktree.agentId)
    try {
      await access(worktree.path)
    } catch {
      await mkdir(this.worktreesRoot, { recursive: true })
      await this.git(['worktree', 'add', worktree.path, worktree.branch])
    }
    this.worktrees.set(worktree.agentId, { ...worktree })
    return { ...worktree }
  }

  get(agentId: string): GitWorkTree | undefined {
    const worktree = this.worktrees.get(agentId)
    return worktree ? { ...worktree } : undefined
  }

  list(): GitWorkTree[] {
    return [...this.worktrees.values()].map((worktree) => ({ ...worktree }))
  }

  async status(agentId: string): Promise<GitWorkTreeStatus> {
    const worktree = this.require(agentId)
    const porcelain = await this.git(
      ['status', '--porcelain=v1', '--untracked-files=all'],
      worktree.path,
    )
    const aheadText = await this.git(
      ['rev-list', '--count', `${worktree.baseCommit}..HEAD`],
      worktree.path,
    )
    return {
      ...worktree,
      changes: porcelain.split('\n').filter(Boolean),
      ahead: Number.parseInt(aheadText.trim(), 10) || 0,
    }
  }

  async diff(agentId: string): Promise<string> {
    const worktree = this.require(agentId)
    const [diff, untracked] = await Promise.all([
      this.git(['diff', '--no-ext-diff', '--binary', worktree.baseCommit], worktree.path),
      this.git(
        ['ls-files', '--others', '--exclude-standard'],
        worktree.path,
      ),
    ])
    const untrackedFiles = untracked.split('\n').filter(Boolean)
    const suffix = untrackedFiles.length > 0
      ? `\n\nUntracked files:\n${untrackedFiles.map((file) => `- ${file}`).join('\n')}`
      : ''
    return `${diff.trim()}${suffix}`.trim()
  }

  async merge(agentId: string): Promise<GitWorkTreeMergeResult> {
    const worktree = this.require(agentId)
    await this.assertMainWorkspaceClean()

    const status = await this.status(agentId)
    if (status.changes.length > 0) {
      await this.git(['add', '-A'], worktree.path)
      await this.git([
        '-c', 'user.name=Microcode',
        '-c', 'user.email=microcode@localhost',
        'commit', '-m', `microcode: agent ${agentId}`,
      ], worktree.path)
    }

    const ahead = Number.parseInt(
      (await this.git(
        ['rev-list', '--count', `${worktree.baseCommit}..${worktree.branch}`],
      )).trim(),
      10,
    ) || 0
    if (ahead === 0) {
      return { merged: false, message: `Agent ${agentId} has no changes to merge.` }
    }
    if (await this.isAncestor(worktree.branch, 'HEAD')) {
      worktree.integratedAt = Date.now()
      return {
        merged: false,
        message: `Agent ${agentId} changes are already present in the main workspace.`,
      }
    }

    try {
      await this.git(['merge', '--no-ff', '--no-commit', worktree.branch])
      await this.git([
        '-c', 'user.name=Microcode',
        '-c', 'user.email=microcode@localhost',
        'commit', '-m', `Merge worktree ${agentId}`,
      ])
    } catch (error) {
      await this.git(['merge', '--abort']).catch(() => undefined)
      throw new Error(
        `Worktree ${agentId} could not be merged cleanly; the merge was aborted: ${commandError(error)}`,
      )
    }

    const commit = (await this.git(['rev-parse', 'HEAD'])).trim()
    worktree.integratedAt = Date.now()
    return {
      merged: true,
      commit,
      message: `Merged ${worktree.branch} into the main workspace at ${commit}.`,
    }
  }

  async remove(agentId: string, force = false): Promise<void> {
    const worktree = this.require(agentId)
    const status = await this.status(agentId)
    const merged = await this.isAncestor(worktree.branch, 'HEAD')
    if (!force && (status.changes.length > 0 || !merged)) {
      throw new Error(
        `Worktree ${agentId} has unmerged changes. Merge it first or remove it with force=true.`,
      )
    }
    await this.git(['worktree', 'remove', ...(force ? ['--force'] : []), worktree.path])
    await this.git(['branch', '-D', worktree.branch]).catch(() => undefined)
    this.worktrees.delete(agentId)
  }

  private require(agentId: string): GitWorkTree {
    const worktree = this.worktrees.get(agentId)
    if (!worktree) throw new Error(`No worktree found for agent ${agentId}.`)
    return worktree
  }

  private assertAgentId(agentId: string): void {
    if (!/^[a-zA-Z0-9._-]+$/.test(agentId)) {
      throw new Error(`Invalid agent ID: ${agentId}`)
    }
  }

  private async assertMainWorkspaceClean(): Promise<void> {
    const status = await this.git(['status', '--porcelain=v1'])
    if (status.trim()) {
      throw new Error(
        'The main Git workspace has uncommitted changes. Commit or stash them before spawning or merging agents.',
      )
    }
  }

  private async isAncestor(ancestor: string, descendant: string): Promise<boolean> {
    try {
      await execFileAsync(
        'git',
        ['merge-base', '--is-ancestor', ancestor, descendant],
        { cwd: this.repositoryRoot },
      )
      return true
    } catch (error) {
      const exitCode = (error as { code?: number | string }).code
      if (exitCode === 1) return false
      throw new Error(commandError(error))
    }
  }

  private async git(args: string[], cwd = this.repositoryRoot): Promise<string> {
    try {
      const result = await execFileAsync('git', args, {
        cwd,
        maxBuffer: 20 * 1024 * 1024,
      })
      return result.stdout
    } catch (error) {
      throw new Error(commandError(error))
    }
  }
}
