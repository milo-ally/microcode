import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { readFile, writeFile } from 'fs/promises'
import { isAbsolute, resolve } from 'path'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'
import { countLineChanges } from '../../utils/diffUtils.ts'

export const TOOL_NAME = 'edit'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'ask'

const editSchema = Type.Object({
  file_path: Type.String({ description: 'Path to the file to edit (relative or absolute)' }),
  old_string: Type.String({ description: 'The exact string to find and replace' }),
  new_string: Type.String({ description: 'The string to replace old_string with' }),
  replace_all: Type.Optional(
    Type.Boolean({ description: 'Replace all occurrences (default false)' }),
  ),
})

export type FileEditToolInput = Static<typeof editSchema>

export interface FileEditToolDetails {
  path: string
  replacements: number
  additions: number
  removals: number
  phase?: 'preparing' | 'writing' | 'complete'
}

export function createFileEditTool(cwd: string): AgentTool<typeof editSchema, FileEditToolDetails> {
  return {
    name: TOOL_NAME,
    label: 'Edit',
    description:
      'Edit a file by replacing an exact string match. The old_string must be unique in the file unless replace_all is true.',
    parameters: editSchema,
    async execute(
      _toolCallId: string,
      params: FileEditToolInput,
      _signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<FileEditToolDetails>) => void,
    ): Promise<AgentToolResult<FileEditToolDetails>> {
      const filePath = isAbsolute(params.file_path)
        ? params.file_path
        : resolve(cwd, params.file_path)

      onUpdate?.({
        content: [{ type: 'text', text: `Preparing edit ${filePath}` }],
        details: {
          path: filePath,
          replacements: 0,
          additions: 0,
          removals: 0,
          phase: 'preparing',
        },
      })

      const content = await readFile(filePath, 'utf-8')

      if (params.old_string === params.new_string) {
        throw new Error('old_string and new_string are identical')
      }

      const replaceAll = params.replace_all ?? false

      if (replaceAll) {
        const count = content.split(params.old_string).length - 1
        if (count === 0) {
          throw new Error(`old_string not found in ${filePath}`)
        }
        const newContent = content.replaceAll(params.old_string, params.new_string)
        const changes = countLineChanges(content, newContent)
        onUpdate?.({
          content: [{ type: 'text', text: `Editing ${filePath}` }],
          details: {
            path: filePath,
            replacements: count,
            ...changes,
            phase: 'writing',
          },
        })
        await writeFile(filePath, newContent, 'utf-8')
        return {
          content: [
            {
              type: 'text',
              text: `Replaced ${count} occurrence(s) in ${filePath}`,
            },
          ],
          details: {
            path: filePath,
            replacements: count,
            ...changes,
            phase: 'complete',
          },
        }
      }

      const count = content.split(params.old_string).length - 1
      if (count === 0) {
        throw new Error(
          `old_string not found in ${filePath}. Make sure the string matches exactly, including whitespace and indentation.`,
        )
      }
      if (count > 1) {
        throw new Error(
          `old_string is not unique in ${filePath} (${count} matches found). Provide more context to make it unique, or use replace_all.`,
        )
      }

      const newContent = content.replace(params.old_string, params.new_string)
      const changes = countLineChanges(content, newContent)
      onUpdate?.({
        content: [{ type: 'text', text: `Editing ${filePath}` }],
        details: {
          path: filePath,
          replacements: 1,
          ...changes,
          phase: 'writing',
        },
      })
      await writeFile(filePath, newContent, 'utf-8')

      return {
        content: [
          {
            type: 'text',
            text: `Replaced 1 occurrence in ${filePath}`,
          },
        ],
        details: {
          path: filePath,
          replacements: 1,
          ...changes,
          phase: 'complete',
        },
      }
    },
  }
}
