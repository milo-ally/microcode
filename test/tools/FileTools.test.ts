import { afterEach, describe, expect, test } from 'bun:test'
import { mkdir, mkdtemp, readFile, rm, truncate, writeFile } from 'fs/promises'
import { tmpdir } from 'os'
import { join } from 'path'
import {
  createFileReadTool,
  LARGE_FILE_WARNING_BYTES,
} from '../../src/tools/FileReadTool/FileReadTool.ts'
import { createFileWriteTool } from '../../src/tools/FileWriteTool/FileWriteTool.ts'

const roots: string[] = []

async function createRoot(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'microcode-file-tools-'))
  roots.push(root)
  return root
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  )
})

describe('FileWriteTool', () => {
  test('prevents concurrent writes from silently overwriting each other', async () => {
    const root = await createRoot()
    const tool = createFileWriteTool(root)

    const results = await Promise.all([
      tool.execute('first', {
        file_path: 'target.txt',
        content: 'first',
      }),
      tool.execute('second', {
        file_path: 'target.txt',
        content: 'second',
      }),
    ])

    expect(results.filter((result) => result.details?.written)).toHaveLength(1)
    expect(results.filter((result) => result.details?.warning)).toHaveLength(1)
    expect(['first', 'second']).toContain(
      await readFile(join(root, 'target.txt'), 'utf8'),
    )
  })

  test('keeps sequential overwrites compatible and supports force', async () => {
    const root = await createRoot()
    const tool = createFileWriteTool(root)

    await tool.execute('initial', {
      file_path: 'target.txt',
      content: 'initial',
    })
    const overwritten = await tool.execute('overwrite', {
      file_path: 'target.txt',
      content: 'updated',
    })
    const forced = await tool.execute('force', {
      file_path: 'target.txt',
      content: 'forced',
      force: true,
    })

    expect(overwritten.details?.written).toBe(true)
    expect(forced.details?.written).toBe(true)
    expect(await readFile(join(root, 'target.txt'), 'utf8')).toBe('forced')
  })
})

describe('FileReadTool', () => {
  test('reports directories with an actionable error', async () => {
    const root = await createRoot()
    await mkdir(join(root, 'src'))

    await expect(createFileReadTool(root).execute('read-dir', {
      file_path: 'src',
    })).rejects.toThrow('Cannot read directory')
  })

  test('warns before content for files larger than 50 MB', async () => {
    const root = await createRoot()
    const filePath = join(root, 'large.txt')
    await writeFile(filePath, `${'line\n'.repeat(128)}`)
    await truncate(filePath, LARGE_FILE_WARNING_BYTES + 1)

    const result = await createFileReadTool(root).execute('read', {
      file_path: filePath,
      limit: 1,
    })

    expect(result.content[0]?.text?.split('\n')[0]).toContain(
      'Warning: large file',
    )
  })

  test('streams files larger than 200 MB and stops after the limit', async () => {
    const root = await createRoot()
    const filePath = join(root, 'huge.txt')
    await writeFile(filePath, `${'safe text line\n'.repeat(64)}`)
    await truncate(filePath, 200 * 1024 * 1024 + 1)

    const startedAt = Date.now()
    const result = await createFileReadTool(root).execute('read', {
      file_path: filePath,
      limit: 3,
    })

    expect(result.details?.returnedLines).toBe(3)
    expect(result.details?.truncated).toBe(true)
    expect(result.content[0]?.text).toContain('streaming stopped early')
    expect(Date.now() - startedAt).toBeLessThan(5000)
  })
})
