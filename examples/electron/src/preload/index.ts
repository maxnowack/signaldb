import { contextBridge, ipcRenderer } from 'electron'
import { setupSignalDBPreload } from '@signaldb/electron/preload'

setupSignalDBPreload(ipcRenderer, contextBridge)
