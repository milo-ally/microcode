import type { BrowserWindow } from 'electron'
import type { ThinkingLevel } from '@earendil-works/pi-agent-core'
import { ensureBootstrapMacro } from '../../macro.ts'
import type { PermissionMode } from '../../permissions/index.ts'
import { createMicrocodeRuntime, type MicrocodeRuntime } from '../runtime/createMicrocodeRuntime.ts'
import type { GuiIpcEvent } from '../shared/types.ts'

export interface RuntimeStartOptions {
  resume?: boolean
  resumeSessionId?: string
  modelId?: string
  permissionMode?: PermissionMode
  thinkingLevel?: ThinkingLevel
}

let mainWindow: BrowserWindow | undefined
let runtime: MicrocodeRuntime | undefined
let unsubscribeRuntime: (() => void) | undefined

ensureBootstrapMacro()

export function attachMainWindow(window: BrowserWindow | undefined): void {
  mainWindow = window
}

export function getMainWindow(): BrowserWindow | undefined {
  return mainWindow
}

export function getExistingRuntime(): MicrocodeRuntime | undefined {
  return runtime
}

function broadcast(event: GuiIpcEvent): void {
  mainWindow?.webContents.send('microcode:event', event)
}

export async function getRuntime(options?: RuntimeStartOptions): Promise<MicrocodeRuntime> {
  if (runtime) return runtime
  runtime = await createMicrocodeRuntime({
    cwd: process.cwd(),
    resume: options?.resume,
    resumeSessionId: options?.resumeSessionId,
    modelId: options?.modelId,
    permissionMode: options?.permissionMode,
    thinkingLevel: options?.thinkingLevel,
  })
  unsubscribeRuntime = runtime.subscribe(broadcast)
  await runtime.start()
  return runtime
}

export async function shutdownRuntime(): Promise<void> {
  if (!runtime) return
  unsubscribeRuntime?.()
  const active = runtime
  runtime = undefined
  await active.shutdown()
}
