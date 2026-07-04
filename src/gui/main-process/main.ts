import { app, BrowserWindow } from 'electron'
import { dirname, join, resolve } from 'path'
import { registerIpc } from './ipc.ts'
import { shutdownRuntime } from './runtimeHost.ts'
import { createMainWindow } from './window.ts'

const appDir = process.env.MICROCODE_GUI_APP_DIR
  ? resolve(process.env.MICROCODE_GUI_APP_DIR)
  : dirname(resolve(process.argv[1] ?? process.cwd()))
const electronDir = join(appDir, 'electron')

app.setName('Microcode')
if (process.platform === 'win32') {
  app.setAppUserModelId('works.earendil.microcode')
} else if (process.platform === 'linux') {
  app.setDesktopName('microcode.desktop')
}

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
