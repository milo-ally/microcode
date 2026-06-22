import { afterEach, describe, expect, test } from 'bun:test'
import { execFile } from 'child_process'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { promisify } from 'util'
import { GitWorkTreeSystem } from '../../src/git/index.ts'

const execFileAsync = promisify(execFile)
const roots: string[] = []

async function git(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync('git', args, { cwd })
  return result.stdout
}

async function createRepository(): Promise<{
  repository: string
  worktreesRoot: string
}> {
  const root = await mkdtemp(join(tmpdir(), 'microcode-worktree-test-'))
  roots.push(root)
  const repository = join(root, 'repository')
  const worktreesRoot = join(root, 'worktrees')
  await mkdir(repository)
  await writeFile(join(repository, '.keep'), '')
  await git(repository, ['init'])
  await git(repository, ['add', '.'])
  await git(repository, [
    '-c', 'user.name=Test',
    '-c', 'user.email=test@example.com',
    'commit', '-m', 'initial',
  ])
  return { repository, worktreesRoot }
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('GitWorkTreeSystem', () => {
  test('creates isolated agent worktrees and merges selected changes', async () => {
    const { repository, worktreesRoot } = await createRepository()
    const system = await GitWorkTreeSystem.open(repository, { worktreesRoot })
    const first = await system.create('agent-one')
    const second = await system.create('agent-two')

    await writeFile(join(first.path, 'result.txt'), 'from one\n')
    await writeFile(join(second.path, 'result.txt'), 'from two\n')

    expect((await system.status('agent-one')).changes).toContain('?? result.txt')
    expect((await system.status('agent-two')).changes).toContain('?? result.txt')
    expect(await readFile(join(second.path, 'result.txt'), 'utf8')).toBe('from two\n')

    const merged = await system.merge('agent-one')
    expect(merged.merged).toBe(true)
    expect(await readFile(join(repository, 'result.txt'), 'utf8')).toBe('from one\n')
    expect(await readFile(join(second.path, 'result.txt'), 'utf8')).toBe('from two\n')

    await system.remove('agent-one')
    await system.remove('agent-two', true)
  })

  test('aborts a conflicting merge and leaves the main workspace clean', async () => {
    const { repository, worktreesRoot } = await createRepository()
    await writeFile(join(repository, 'shared.txt'), 'base\n')
    await git(repository, ['add', '.'])
    await git(repository, [
      '-c', 'user.name=Test',
      '-c', 'user.email=test@example.com',
      'commit', '-m', 'add shared',
    ])

    const system = await GitWorkTreeSystem.open(repository, { worktreesRoot })
    const first = await system.create('agent-one')
    const second = await system.create('agent-two')
    await writeFile(join(first.path, 'shared.txt'), 'first\n')
    await writeFile(join(second.path, 'shared.txt'), 'second\n')

    await system.merge('agent-one')
    await expect(system.merge('agent-two')).rejects.toThrow('merge was aborted')
    expect(await readFile(join(repository, 'shared.txt'), 'utf8')).toBe('first\n')
    expect((await git(repository, ['status', '--porcelain=v1'])).trim()).toBe('')

    await system.remove('agent-one')
    await system.remove('agent-two', true)
  })

  test('refuses to create a worktree from a dirty main workspace', async () => {
    const { repository, worktreesRoot } = await createRepository()
    const system = await GitWorkTreeSystem.open(repository, { worktreesRoot })
    await writeFile(join(repository, 'dirty.txt'), 'dirty\n')

    await expect(system.create('agent-one')).rejects.toThrow(
      'main Git workspace has uncommitted changes',
    )
  })
})
