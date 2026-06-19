import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { Type, type Static } from 'typebox'
import type { PermissionBehavior } from '../../permissions/types.ts'

export const TOOL_NAME = 'bash'
export const TOOL_DEFAULT_PERMISSION: PermissionBehavior = 'ask'

const shellConfig = getShellConfig()

const bashSchema = Type.Object({
  command: Type.String({ description: `${shellConfig.name} command to execute` }),
  timeout: Type.Optional(
    Type.Number({ description: 'Timeout in seconds (optional, no default timeout)' }),
  ),
  description: Type.Optional(
    Type.String({
      description:
        'Clear description of what this command does (shown to user before execution)',
    }),
  ),
})

export type BashToolInput = Static<typeof bashSchema>

export interface BashToolDetails {
  stdout: string
  stderr: string
  exitCode: number | null
}

function getShellConfig(): { shell: string; args: string[]; name: string } {
  if (process.platform === 'win32') {
    if (process.env.PSModulePath || process.env.SHELL?.includes('powershell')) {
      return { shell: 'powershell.exe', args: ['-NoProfile', '-Command'], name: 'PowerShell' }
    }
    return { shell: 'cmd.exe', args: ['/c'], name: 'cmd.exe' }
  }
  return { shell: '/bin/bash', args: ['-c'], name: 'Bash' }
}

export function createBashTool(cwd: string): AgentTool<typeof bashSchema, BashToolDetails> {
  return {
    name: TOOL_NAME,
    label: shellConfig.name,
    description: `Execute a shell command in ${shellConfig.name} and return its output.`,
    parameters: bashSchema,
    async execute(
      _toolCallId: string,
      params: BashToolInput,
      signal?: AbortSignal,
      onUpdate?: (partial: AgentToolResult<BashToolDetails>) => void,
    ): Promise<AgentToolResult<BashToolDetails>> {
      const { command, timeout } = params

      if (!existsSync(cwd)) {
        throw new Error(`Working directory does not exist: ${cwd}`)
      }

      const { shell, args } = getShellConfig()
      let stdout = ''
      let stderr = ''
      let updateTimer: ReturnType<typeof setTimeout> | undefined

      const emitUpdate = () => {
        updateTimer = undefined
        onUpdate?.({
          content: [{ type: 'text', text: stdout + stderr }],
          details: { stdout, stderr, exitCode: null },
        })
      }

      const scheduleUpdate = () => {
        if (!onUpdate || updateTimer) return
        updateTimer = setTimeout(emitUpdate, 200)
      }

      const exitCode = await new Promise<number | null>((resolve, reject) => {
        const child = spawn(shell, [...args, command], {
          cwd,
          detached: process.platform !== 'win32',
          stdio: ['ignore', 'pipe', 'pipe'],
          windowsHide: true,
        })

        let timedOut = false
        let timeoutHandle: NodeJS.Timeout | undefined

        if (timeout && timeout > 0) {
          timeoutHandle = setTimeout(() => {
            timedOut = true
            try {
              process.kill(-child.pid!, 'SIGKILL')
            } catch {
              child.kill('SIGKILL')
            }
          }, timeout * 1000)
        }

        child.stdout?.on('data', (data: Buffer) => {
          const text = data.toString()
          stdout += text
          scheduleUpdate()
        })

        child.stderr?.on('data', (data: Buffer) => {
          const text = data.toString()
          stderr += text
          scheduleUpdate()
        })

        const onAbort = () => {
          try {
            process.kill(-child.pid!, 'SIGKILL')
          } catch {
            child.kill('SIGKILL')
          }
        }
        if (signal) {
          if (signal.aborted) onAbort()
          else signal.addEventListener('abort', onAbort, { once: true })
        }

        child.on('close', (code) => {
          if (timeoutHandle) clearTimeout(timeoutHandle)
          if (updateTimer) {
            clearTimeout(updateTimer)
            emitUpdate()
          }
          if (timedOut) {
            resolve(null)
          } else {
            resolve(code)
          }
        })

        child.on('error', (err) => {
          if (timeoutHandle) clearTimeout(timeoutHandle)
          if (updateTimer) clearTimeout(updateTimer)
          reject(err)
        })
      })

      const output = stdout + stderr
      const truncated =
        output.length > 100000
          ? output.slice(0, 50000) + '\n\n... [output truncated] ...\n\n' + output.slice(-50000)
          : output

      return {
        content: [{ type: 'text', text: truncated || '(no output)' }],
        details: { stdout, stderr, exitCode },
      }
    },
  }
}
