import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { writeFile, mkdir, readFile } from 'fs/promises'
import { dirname, isAbsolute, resolve } from 'path'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import { countLineChanges } from '../../utils/diffUtils.ts'
import { countContentLines } from '../../tui/toolPresentation.ts'

export const TOOL_NAME = 'write'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'ask'

const writeSchema = Type.Object({
  file_path: Type.String({ description: 'Path to the file to write (relative or absolute)' }),
  content: Type.String({ description: 'Content to write to the file' }),
})

export type FileWriteToolInput = Static<typeof writeSchema>

export interface FileWriteToolDetails {
  path: string
  bytesWritten: number
  additions: number
  removals: number
  isNewFile: boolean
  preview?: string
  phase?: 'writing' | 'complete'
}

export function createFileWriteTool(cwd: string): AgentTool<typeof writeSchema, FileWriteToolDetails> {
  return {
    name: TOOL_NAME,
    label: 'Write',
    description:
      'Write content to a file. Creates the file if it does not exist, overwrites if it does. Creates parent directories as needed.',
    parameters: writeSchema,
    async execute(
      _toolCallId: string,
      params: FileWriteToolInput,
      _signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<FileWriteToolDetails>) => void,
    ): Promise<AgentToolResult<FileWriteToolDetails>> {
      const filePath = isAbsolute(params.file_path)
        ? params.file_path
        : resolve(cwd, params.file_path)

      // Read existing content before overwriting (for diff display)
      let oldContent: string | undefined
      try {
        oldContent = await readFile(filePath, 'utf-8')
      } catch {
        // File doesn't exist yet — new file
      }

      const dir = dirname(filePath)
      await mkdir(dir, { recursive: true })

      const isNewFile = oldContent === undefined
      const changes = oldContent === undefined
        ? { additions: countContentLines(params.content), removals: 0 }
        : countLineChanges(oldContent, params.content)
      const bytesWritten = Buffer.byteLength(params.content, 'utf8')
      const preview = isNewFile ? params.content.slice(0, 4000) : undefined

      onUpdate?.({
        content: [{ type: 'text', text: `Writing ${filePath}` }],
        details: {
          path: filePath,
          bytesWritten,
          ...changes,
          isNewFile,
          preview,
          phase: 'writing',
        },
      })

      await writeFile(filePath, params.content, 'utf-8')

      return {
        content: [
          {
            type: 'text',
            text: `File written successfully: ${filePath} (${Buffer.byteLength(params.content, 'utf8')} bytes)`,
          },
        ],
        details: {
          path: filePath,
          bytesWritten,
          ...changes,
          isNewFile,
          preview,
          phase: 'complete',
        },
      }
    },
  }
}
