import { app, BrowserWindow } from 'electron'
import { dirname, resolve } from 'path'
import { registerIpc } from './ipc.ts'
import { shutdownRuntime } from './runtimeHost.ts'
import { createMainWindow } from './window.ts'

const electronDir = dirname(resolve(process.argv[1] ?? process.cwd()))

registerIpc()

app.whenReady().then(async () => {
  await createMainWindow(electronDir)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow(electronDir)
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', async (event) => {
  event.preventDefault()
  await shutdownRuntime()
  app.exit(0)
})
