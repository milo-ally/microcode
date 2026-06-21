import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { constants, createReadStream } from 'fs'
import { access, open, readFile, stat } from 'fs/promises'
import { isAbsolute, resolve } from 'path'
import { createInterface } from 'readline'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'

export const TOOL_NAME = 'read'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'allow'

export const LARGE_FILE_WARNING_BYTES = 50 * 1024 * 1024
const STREAMING_FILE_BYTES = 200 * 1024 * 1024
const DEFAULT_LIMIT = 2000

const readSchema = Type.Object({
  file_path: Type.String({ description: 'Path to the file to read (relative or absolute)' }),
  offset: Type.Optional(
    Type.Number({ description: 'Line number to start reading from (1-indexed)' }),
  ),
  limit: Type.Optional(
    Type.Number({ description: 'Maximum number of lines to read (default 2000)' }),
  ),
})

export type FileReadToolInput = Static<typeof readSchema>

export interface FileReadToolDetails {
  path: string
  totalLines: number
  returnedLines: number
  truncated: boolean
}

function addLineNumbers(lines: readonly string[], startLine: number): string {
  const maxLineNum = startLine + lines.length - 1
  const padding = String(Math.max(startLine, maxLineNum)).length
  return lines
    .map((line, index) => {
      const lineNum = String(startLine + index).padStart(padding, ' ')
      return `${lineNum}\t${line}`
    })
    .join('\n')
}

async function assertTextFile(filePath: string): Promise<void> {
  const handle = await open(filePath, 'r')
  try {
    const sample = Buffer.alloc(512)
    const { bytesRead } = await handle.read(sample, 0, sample.length, 0)
    if (!sample.subarray(0, bytesRead).includes(0)) return

    const ext = filePath.split('.').pop()?.toLowerCase() ?? ''
    const isImage = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'].includes(ext)
    const tip = isImage ? ' Use the vision tool to analyze image files.' : ''
    throw new Error(`Cannot read binary file: ${filePath}.${tip}`)
  } finally {
    await handle.close()
  }
}

async function readStreamedLines(
  filePath: string,
  offset: number,
  limit: number,
): Promise<{
  lines: string[]
  observedLines: number
  truncated: boolean
}> {
  const stream = createReadStream(filePath, { encoding: 'utf8' })
  const reader = createInterface({ input: stream, crlfDelay: Infinity })
  const lines: string[] = []
  let observedLines = 0
  let truncated = false

  try {
    for await (const line of reader) {
      observedLines++
      if (observedLines < offset) continue
      if (lines.length < limit) {
        lines.push(line)
        continue
      }
      truncated = true
      break
    }
  } finally {
    reader.close()
    stream.destroy()
  }

  return { lines, observedLines, truncated }
}

export function createFileReadTool(
  cwd: string,
): AgentTool<typeof readSchema, FileReadToolDetails> {
  return {
    name: TOOL_NAME,
    label: 'Read',
    description:
      'Read the contents of a text file. Returns file content with line numbers. Use offset and limit for large files. Do NOT use for images, binaries, or non-text files; use the vision tool for images instead.',
    parameters: readSchema,
    async execute(
      _toolCallId: string,
      params: FileReadToolInput,
    ): Promise<AgentToolResult<FileReadToolDetails>> {
      const filePath = isAbsolute(params.file_path)
        ? params.file_path
        : resolve(cwd, params.file_path)

      await access(filePath, constants.R_OK)
      const fileStat = await stat(filePath)
      await assertTextFile(filePath)

      const offset = Math.max(1, params.offset ?? 1)
      const limit = Math.max(0, params.limit ?? DEFAULT_LIMIT)
      const warning = fileStat.size > LARGE_FILE_WARNING_BYTES
        ? `Warning: large file (${(fileStat.size / 1024 / 1024).toFixed(1)} MB). Output is limited; use offset and limit to read it in sections.`
        : undefined

      let selectedLines: string[]
      let totalLines: number
      let truncated: boolean
      let continuation: string | undefined

      if (fileStat.size > STREAMING_FILE_BYTES) {
        const streamed = await readStreamedLines(filePath, offset, limit)
        selectedLines = streamed.lines
        totalLines = streamed.observedLines
        truncated = streamed.truncated
        if (truncated) {
          continuation =
            `... (more lines remain; streaming stopped early. Use offset=${offset + selectedLines.length} to continue)`
        }
      } else {
        const content = await readFile(filePath, 'utf8')
        const allLines = content.split('\n')
        totalLines = allLines.length
        const startIndex = offset - 1
        const endIndex = Math.min(startIndex + limit, totalLines)
        selectedLines = allLines.slice(startIndex, endIndex)
        truncated = endIndex < totalLines
        if (truncated) {
          continuation =
            `... (${totalLines - endIndex} more lines, ${totalLines} total. Use offset=${endIndex + 1} to continue)`
        }
      }

      const sections: string[] = []
      if (warning) sections.push(warning)
      const numbered = addLineNumbers(selectedLines, offset)
      if (numbered) sections.push(numbered)
      if (continuation) sections.push(continuation)

      return {
        content: [{ type: 'text', text: sections.join('\n\n') }],
        details: {
          path: filePath,
          totalLines,
          returnedLines: selectedLines.length,
          truncated,
        },
      }
    },
  }
}
