import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtemp, rm, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import { createBashTool } from '../../src/tools/BashTool/BashTool.ts'
import { createGitWorkTreeTool } from '../../src/tools/GitWorkTreeTool/GitWorkTreeTool.ts'
import { createVisionTool } from '../../src/tools/VisionTool/VisionTool.ts'
import { createWebFetchTool } from '../../src/tools/WebFetchTool/WebFetchTool.ts'
import { createWebSearchTool } from '../../src/tools/WebSearchTool/WebSearchTool.ts'

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe('runtime tools', () => {
  test('Bash tool executes, normalizes output, rejects missing cwd, and handles timeout', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'microcode-bash-'))
    try {
      const updates: any[] = []
      const tool = createBashTool(cwd)
      const result = await tool.execute('bash', {
        command: 'printf "one\\rTWO\\n"; printf "err\\n" >&2',
      }, undefined, (update) => updates.push(update))

      expect(result.details?.stdout).toContain('TWO')
      expect(result.details?.stderr).toContain('err')
      expect(result.details?.exitCode).toBe(0)

      const timed = await tool.execute('bash', { command: 'sleep 1', timeout: 0.01 })
      expect(timed.details?.exitCode).toBeNull()
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }

    await expect(createBashTool(join(cwd, 'missing')).execute('bash', { command: 'true' }))
      .rejects.toThrow('Working directory does not exist')
  })

  test('Vision tool reads local files, fetches URLs, and rejects invalid sources', async () => {
    const cwd = await mkdtemp(join(tmpdir(), 'microcode-vision-'))
    try {
      const imagePath = join(cwd, 'image.png')
      await writeFile(imagePath, Buffer.from([1, 2, 3]))
      const tool = createVisionTool(cwd)

      const local = await tool.execute('vision', { image_source: 'image.png', prompt: 'describe' })
      expect(local.details?.sourceType).toBe('file')
      expect(local.content[1]).toMatchObject({ type: 'image', mimeType: 'image/png' })

      globalThis.fetch = (async () => new Response(Buffer.from([4, 5]), {
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
      })) as any
      const remote = await tool.execute('vision', { image_source: 'https://example.com/a.jpg', prompt: 'remote' })
      expect(remote.details?.sourceType).toBe('url')
      expect(remote.details?.mimeType).toBe('image/jpeg')

      await expect(tool.execute('vision', { image_source: 'missing.png', prompt: 'nope' }))
        .rejects.toThrow('not a supported image')
    } finally {
      await rm(cwd, { recursive: true, force: true })
    }
  })

  test('WebFetch normalizes URLs, extracts HTML text, handles errors, and enforces URL rules', async () => {
    globalThis.fetch = (async (url: string) => {
      if (url.includes('too-large')) {
        return new Response('x', {
          status: 200,
          headers: { 'content-length': String(11 * 1024 * 1024) },
        })
      }
      if (url.includes('missing')) {
        return new Response('missing', { status: 404, statusText: 'Not Found' })
      }
      return new Response('<html><style>.x{}</style><p>Hello &amp; <a href="https://a.test">link</a></p></html>', {
        status: 200,
        headers: { 'content-type': 'text/html' },
      })
    }) as any
    const tool = createWebFetchTool()

    const result = await tool.execute('fetch', { url: 'http://example.com/page', prompt: 'summarize' })
    expect(result.details?.url).toBe('https://example.com/page')
    expect(result.content[0]?.text).toContain('Hello & link')
    await expect(tool.execute('fetch', { url: 'ftp://example.com', prompt: 'bad' })).rejects.toThrow('Only HTTP and HTTPS')
    await expect(tool.execute('fetch', { url: 'https://user:pass@example.com', prompt: 'bad' })).rejects.toThrow('embedded credentials')
    await expect(tool.execute('fetch', { url: 'https://example.com/too-large', prompt: 'bad' })).rejects.toThrow('too large')
    await expect(tool.execute('fetch', { url: 'https://example.com/missing', prompt: 'bad' })).rejects.toThrow('404')
  })

  test('WebSearch parses DuckDuckGo HTML, filters domains, validates query options, and formats empty results', async () => {
    const html = `
      <div class="result results_links">
        <a class="result__a" href="https://duckduckgo.com/l/?uddg=https%3A%2F%2Fallowed.test%2Fa">Allowed &amp; Result</a>
        <a class="result__snippet">Allowed snippet</a>
      </div>
      <div class="result results_links">
        <a class="result__a" href="https://blocked.test/b">Blocked Result</a>
      </div>
      <div class="nav"></div>
    `
    globalThis.fetch = (async () => new Response(html, { status: 200 })) as any
    const tool = createWebSearchTool()

    const result = await tool.execute('search', {
      query: ' test ',
      allowed_domains: ['allowed.test'],
      max_results: 10,
    })
    expect(result.details?.results).toHaveLength(1)
    expect(result.content[0]?.text).toContain('Allowed & Result')

    globalThis.fetch = (async () => new Response('', { status: 200 })) as any
    expect((await tool.execute('search', { query: 'nothing' })).content[0]?.text).toContain('No web search results')
    await expect(tool.execute('search', { query: ' ' })).rejects.toThrow('Missing search query')
    await expect(tool.execute('search', { query: 'x', allowed_domains: ['a.test'], blocked_domains: ['b.test'] })).rejects.toThrow('Cannot specify both')
  })

  test('GitWorkTree tool delegates all supported actions and validates required ids', async () => {
    const calls: string[] = []
    const supervisor = {
      listWorktrees: async () => [{ agentId: 'agent-1', phase: 'ready', branch: 'b', changes: ['M a'], ahead: 1, mergeable: true }],
      waitForBatch: async (batchId: string, options: any) => {
        options.onProgress({ batchId, completed: 1, total: 1 })
        return [{ agentId: 'agent-1', description: 'Work', status: 'completed', result: 'done', usage: { tokens: 1, toolCalls: 2 } }]
      },
      getWorktreeDiff: async (agentId: string) => {
        calls.push(`diff:${agentId}`)
        return 'diff text'
      },
      getWorktreeStatus: async (agentId: string) => ({ agentId, branch: 'b', phase: 'ready', path: '/tmp/w', ahead: 0, changes: [] }),
      mergeWorktree: async (agentId: string) => ({ agentId, merged: true, message: 'merged' }),
      removeWorktree: async (agentId: string, force: boolean) => calls.push(`remove:${agentId}:${force}`),
    } as any
    const tool = createGitWorkTreeTool(supervisor)

    expect((await tool.execute('wt', { action: 'list' })).content[0]?.text).toContain('agent-1')
    expect((await tool.execute('wt', { action: 'wait', batch_id: 'batch-1' })).content[0]?.text).toContain('Agent batch batch-1 complete')
    expect((await tool.execute('wt', { action: 'status', agent_id: 'agent-1' })).content[0]?.text).toContain('Phase')
    expect((await tool.execute('wt', { action: 'diff', agent_id: 'agent-1' })).content[0]?.text).toContain('diff text')
    expect((await tool.execute('wt', { action: 'merge', agent_id: 'agent-1' })).content[0]?.text).toContain('merged')
    expect((await tool.execute('wt', { action: 'remove', agent_id: 'agent-1', force: true })).details).toMatchObject({ removed: true })
    await expect(tool.execute('wt', { action: 'wait' })).rejects.toThrow('batch_id is required')
    await expect(tool.execute('wt', { action: 'status' })).rejects.toThrow('agent_id is required')
    expect(calls).toContain('remove:agent-1:true')
  })
})
