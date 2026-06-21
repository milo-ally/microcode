import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core'
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { stripVTControlCharacters } from 'util'
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
  output: string
  exitCode: number | null
}

function normalizeTerminalOutput(value: string): string {
  const withoutAnsi = stripVTControlCharacters(value)
    .replace(/\r\n/g, '\n')
    .replace(/\0/g, '')

  return withoutAnsi
    .split('\n')
    .map((line) => {
      // A bare carriage return means "overwrite this terminal line".
      let current = line.split('\r').at(-1) ?? ''
      while (current.includes('\b')) {
        current = current.replace(/[^\b]\b/g, '')
      }
      return current.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trimEnd()
    })
    .join('\n')
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
      let output = ''
      let updateTimer: ReturnType<typeof setTimeout> | undefined

      const emitUpdate = () => {
        updateTimer = undefined
        const cleanStdout = normalizeTerminalOutput(stdout)
        const cleanStderr = normalizeTerminalOutput(stderr)
        const cleanOutput = normalizeTerminalOutput(output)
        onUpdate?.({
          content: [{ type: 'text', text: cleanOutput }],
          details: {
            stdout: cleanStdout,
            stderr: cleanStderr,
            output: cleanOutput,
            exitCode: null,
          },
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
          output += text
          scheduleUpdate()
        })

        child.stderr?.on('data', (data: Buffer) => {
          const text = data.toString()
          stderr += text
          output += text
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

      stdout = normalizeTerminalOutput(stdout)
      stderr = normalizeTerminalOutput(stderr)
      output = normalizeTerminalOutput(output)
      const truncated =
        output.length > 100000
          ? output.slice(0, 50000) + '\n\n... [output truncated] ...\n\n' + output.slice(-50000)
          : output

      return {
        content: [{ type: 'text', text: truncated || '(no output)' }],
        details: { stdout, stderr, output, exitCode },
      }
    },
  }
}
