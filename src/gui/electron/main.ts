import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import { dirname, join, resolve } from 'path'
import { createMicrocodeRuntime, type MicrocodeRuntime } from '../runtime/createMicrocodeRuntime.ts'
import { ensureBootstrapMacro } from '../../macro.ts'
import type { GuiIpcEvent, GuiPromptInput, GuiPermissionDecision } from '../shared/types.ts'
import type { GuiApiConfigInput } from '../shared/types.ts'
import type { ThinkingLevel } from '@earendil-works/pi-agent-core'
import type { PermissionMode } from '../../permissions/index.ts'

const electronDir = dirname(resolve(process.argv[1] ?? process.cwd()))

let mainWindow: BrowserWindow | undefined
let runtime: MicrocodeRuntime | undefined
let unsubscribeRuntime: (() => void) | undefined

ensureBootstrapMacro()

function broadcast(event: GuiIpcEvent): void {
  mainWindow?.webContents.send('microcode:event', event)
}

async function getRuntime(options?: {
  resume?: boolean
  resumeSessionId?: string
  modelId?: string
  permissionMode?: PermissionMode
  thinkingLevel?: ThinkingLevel
}): Promise<MicrocodeRuntime> {
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

function registerIpc(): void {
  ipcMain.handle('microcode:start', async (_event, options) => {
    const active = await getRuntime(options)
    return {
      snapshot: active.getSnapshot(),
      timeline: active.getTimeline(),
    }
  })
  ipcMain.handle('microcode:prompt', async (_event, input: GuiPromptInput) => {
    await (await getRuntime()).prompt(input)
  })
  ipcMain.handle('microcode:command', async (_event, command: string) => {
    await (await getRuntime()).command(command)
  })
  ipcMain.handle('microcode:abort', async () => {
    await (await getRuntime()).abort()
  })
  ipcMain.handle('microcode:shutdown', async () => {
    await runtime?.shutdown()
  })
  ipcMain.handle('microcode:setModel', async (_event, modelId: string) => {
    await (await getRuntime()).setModel(modelId)
  })
  ipcMain.handle('microcode:setApiConfig', async (_event, input: GuiApiConfigInput) => {
    await (await getRuntime()).setApiConfig(input)
  })
  ipcMain.handle('microcode:setThinkingLevel', async (_event, level: ThinkingLevel) => {
    await (await getRuntime()).setThinkingLevel(level)
  })
  ipcMain.handle('microcode:setPermissionMode', async (_event, mode: PermissionMode) => {
    await (await getRuntime()).setPermissionMode(mode)
  })
  ipcMain.handle('microcode:switchSession', async (_event, sessionId: string) => {
    await (await getRuntime()).switchSession(sessionId)
  })
  ipcMain.handle('microcode:newSession', async () => {
    await (await getRuntime()).newSession()
  })
  ipcMain.handle('microcode:toggleSkill', async (_event, skillName: string) => {
    await (await getRuntime()).toggleSkill(skillName)
  })
  ipcMain.handle('microcode:remindTask', async (_event, listId: string, taskId: string, reminder: boolean) => {
    await (await getRuntime()).remindTask(listId, taskId, reminder)
  })
  ipcMain.handle('microcode:mcpAction', async (_event, action: 'enable' | 'disable' | 'reconnect', serverName: string) => {
    await (await getRuntime()).mcpAction(action, serverName)
  })
  ipcMain.handle('microcode:pickImages', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      title: 'Upload images',
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp'] },
      ],
    })
    return result.canceled ? [] : result.filePaths
  })
  ipcMain.handle('microcode:answerPermission', async (_event, requestId: string, decision: GuiPermissionDecision) => {
    await (await getRuntime()).answerPermission(requestId, decision)
  })
  ipcMain.handle('microcode:answerQuestion', async (_event, requestId: string, answers: Record<string, string>, block?: boolean) => {
    await (await getRuntime()).answerQuestion(requestId, answers, block)
  })
  ipcMain.handle('microcode:listSessions', async () => {
    return (await getRuntime()).listSessions()
  })
}

async function createWindow(): Promise<void> {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0f1117',
    title: 'Microcode',
    webPreferences: {
      preload: join(electronDir, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    console.log(`[renderer:${level}] ${message} (${sourceId}:${line})`)
  })
  mainWindow.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error(`[renderer:load-failed] ${code} ${description} ${url}`)
  })
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error(`[renderer:gone] ${details.reason}`)
  })

  await mainWindow.loadFile(join(electronDir, '../renderer/index.html'))
  mainWindow.on('closed', () => {
    mainWindow = undefined
  })
}

registerIpc()

app.whenReady().then(async () => {
  await createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (event) => {
  if (!runtime) return
  event.preventDefault()
  unsubscribeRuntime?.()
  const active = runtime
  runtime = undefined
  await active.shutdown()
  app.exit(0)
})
