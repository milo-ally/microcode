import { contextBridge, ipcRenderer } from 'electron'
import type { GuiApi, GuiApiConfigInput, GuiIpcEvent, GuiPermissionDecision, GuiPromptInput } from '../shared/types.ts'
import type { ThinkingLevel } from '@earendil-works/pi-agent-core'
import type { PermissionMode } from '../../permissions/index.ts'

const api: GuiApi = {
  start: (options) => ipcRenderer.invoke('microcode:start', options),
  prompt: (input: GuiPromptInput) => ipcRenderer.invoke('microcode:prompt', input),
  command: (command: string) => ipcRenderer.invoke('microcode:command', command),
  abort: () => ipcRenderer.invoke('microcode:abort'),
  shutdown: () => ipcRenderer.invoke('microcode:shutdown'),
  setModel: (modelId: string) => ipcRenderer.invoke('microcode:setModel', modelId),
  setApiConfig: (input: GuiApiConfigInput) => ipcRenderer.invoke('microcode:setApiConfig', input),
  setThinkingLevel: (level: ThinkingLevel) => ipcRenderer.invoke('microcode:setThinkingLevel', level),
  setPermissionMode: (mode: PermissionMode) => ipcRenderer.invoke('microcode:setPermissionMode', mode),
  switchSession: (sessionId: string) => ipcRenderer.invoke('microcode:switchSession', sessionId),
  newSession: () => ipcRenderer.invoke('microcode:newSession'),
  toggleSkill: (skillName: string) => ipcRenderer.invoke('microcode:toggleSkill', skillName),
  remindTask: (listId: string, taskId: string, reminder: boolean) =>
    ipcRenderer.invoke('microcode:remindTask', listId, taskId, reminder),
  mcpAction: (action: 'enable' | 'disable' | 'reconnect', serverName: string) =>
    ipcRenderer.invoke('microcode:mcpAction', action, serverName),
  pickImages: () => ipcRenderer.invoke('microcode:pickImages'),
  answerPermission: (requestId: string, decision: GuiPermissionDecision) =>
    ipcRenderer.invoke('microcode:answerPermission', requestId, decision),
  answerQuestion: (requestId: string, answers: Record<string, string>, block?: boolean) =>
    ipcRenderer.invoke('microcode:answerQuestion', requestId, answers, block),
  listSessions: () => ipcRenderer.invoke('microcode:listSessions'),
  onEvent: (listener: (event: GuiIpcEvent) => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: GuiIpcEvent) => listener(payload)
    ipcRenderer.on('microcode:event', wrapped)
    return () => ipcRenderer.off('microcode:event', wrapped)
  },
}

contextBridge.exposeInMainWorld('microcode', api)
