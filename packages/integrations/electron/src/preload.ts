import type {
  IpcRendererLike,
  ContextBridgeLike,
  ChangePayload,
  SignalDBBridge,
} from './types'
import {
  SIGNALDB_LOAD,
  SIGNALDB_SAVE,
  SIGNALDB_REGISTER,
  SIGNALDB_UNREGISTER,
  SIGNALDB_CHANGE,
} from './types'

/**
 * Sets up the SignalDB preload bridge via contextBridge.
 * @param ipcRenderer - Electron's ipcRenderer (or compatible)
 * @param contextBridge - Electron's contextBridge (or compatible)
 */
export function setupSignalDBPreload(
  ipcRenderer: IpcRendererLike,
  contextBridge: ContextBridgeLike,
): void {
  const bridge: SignalDBBridge = {
    load(collectionName) {
      return ipcRenderer.invoke(SIGNALDB_LOAD, { collectionName })
    },
    save(collectionName, items, changes) {
      return ipcRenderer.invoke(
        SIGNALDB_SAVE,
        { collectionName, items, changes },
      )
    },
    register(collectionName) {
      return ipcRenderer.invoke(
        SIGNALDB_REGISTER,
        { collectionName },
      )
    },
    unregister(collectionName) {
      return ipcRenderer.invoke(
        SIGNALDB_UNREGISTER,
        { collectionName },
      )
    },
    onChange(callback: (payload: ChangePayload<any>) => void) {
      const listener = (
        _event: any,
        payload: ChangePayload<any>,
      ) => {
        callback(payload)
      }
      ipcRenderer.on(SIGNALDB_CHANGE, listener)
      return () => {
        ipcRenderer.removeListener(SIGNALDB_CHANGE, listener)
      }
    },
  }

  contextBridge.exposeInMainWorld('signaldb', bridge)
}
