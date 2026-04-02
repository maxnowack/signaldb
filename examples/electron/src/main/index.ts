import path from 'path'
import { app, BrowserWindow, ipcMain } from 'electron'
import { Collection } from '@signaldb/core'
import { setupSignalDBMain } from '@signaldb/electron/main'
import createFilesystemAdapter from '@signaldb/fs'

const Todos = new Collection<{ id: string, text: string, completed: boolean }>({
  persistence: createFilesystemAdapter(path.join(app.getPath('userData'), 'todos.json')),
})

setupSignalDBMain(ipcMain, {
  todos: Todos,
})

await app.whenReady()

const win = new BrowserWindow({
  width: 800,
  height: 600,
  webPreferences: {
    preload: path.join(__dirname, '..', 'preload', 'index.js'),
    contextIsolation: true,
    nodeIntegration: false,
  },
})

await win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
