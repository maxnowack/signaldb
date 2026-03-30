import type {
  IpcMainLike,
  WebContentsLike,
  IpcMainInvokeEventLike,
  LoadPayload,
  SavePayload,
  RegisterPayload,
  UnregisterPayload,
  CollectionLike,
} from './types'
import {
  SIGNALDB_LOAD,
  SIGNALDB_SAVE,
  SIGNALDB_REGISTER,
  SIGNALDB_UNREGISTER,
  SIGNALDB_CHANGE,
} from './types'

/**
 * Sets up SignalDB IPC handlers in the Electron main process.
 * @param ipcMain - Electron's ipcMain (or compatible)
 * @param collections - Map of collection names to Collection instances
 * @returns Object with a dispose() method to clean up all handlers
 */
export function setupSignalDBMain(
  ipcMain: IpcMainLike,
  collections: Record<string, CollectionLike>,
): { dispose(): void } {
  const subscribers = new Map<string, Set<WebContentsLike>>()
  const cleanups = new Map<string, () => void>()

  /**
   * @param collectionName - The name of the collection to retrieve
   * @returns The collection instance
   */
  function getCollection(collectionName: string): CollectionLike {
    const collection = collections[collectionName]
    if (!collection) {
      throw new Error(
        `@signaldb/electron: unknown collection "${collectionName}"`,
      )
    }
    return collection
  }

  /**
   * @param collectionName - The name of the collection
   * @returns The set of subscribers for the collection
   */
  function getSubscribers(
    collectionName: string,
  ): Set<WebContentsLike> {
    let set = subscribers.get(collectionName)
    if (!set) {
      set = new Set()
      subscribers.set(collectionName, set)
    }
    return set
  }

  /**
   * @param collectionName - The name of the collection to notify
   */
  function notifySubscribers(collectionName: string) {
    const subs = subscribers.get(collectionName)
    if (!subs) return
    const collection = collections[collectionName]
    if (!collection) return
    const data = { items: collection.find().fetch() }
    for (const webContents of subs) {
      if (!webContents.isDestroyed()) {
        webContents.send(
          SIGNALDB_CHANGE,
          { collectionName, data },
        )
      }
    }
  }

  /**
   * @param collectionName - The name of the collection
   */
  function setupListeners(collectionName: string) {
    if (cleanups.has(collectionName)) return
    const collection = getCollection(collectionName)

    const onAdded = () => notifySubscribers(collectionName)
    const onChanged = () => notifySubscribers(collectionName)
    const onRemoved = () => notifySubscribers(collectionName)

    collection.on('added', onAdded)
    collection.on('changed', onChanged)
    collection.on('removed', onRemoved)

    cleanups.set(collectionName, () => {
      collection.off('added', onAdded)
      collection.off('changed', onChanged)
      collection.off('removed', onRemoved)
    })
  }

  /**
   * @param collectionName - The name of the collection
   */
  function teardownListeners(collectionName: string) {
    const cleanup = cleanups.get(collectionName)
    if (cleanup) {
      cleanup()
      cleanups.delete(collectionName)
    }
  }

  ipcMain.handle(
    SIGNALDB_LOAD,
    async (
      _event: IpcMainInvokeEventLike,
      payload: LoadPayload,
    ) => {
      const collection = getCollection(payload.collectionName)
      return { items: collection.find().fetch() }
    },
  )

  ipcMain.handle(
    SIGNALDB_SAVE,
    async (
      _event: IpcMainInvokeEventLike,
      payload: SavePayload<any>,
    ) => {
      const collection = getCollection(payload.collectionName)
      const { changes } = payload
      collection.batch(() => {
        for (const item of changes.added) {
          collection.insert(item)
        }
        for (const item of changes.modified) {
          collection.updateOne(
            { id: item.id } as any,
            { $set: item } as any,
          )
        }
        for (const item of changes.removed) {
          collection.removeOne({ id: item.id } as any)
        }
      })
    },
  )

  ipcMain.handle(
    SIGNALDB_REGISTER,
    async (
      event: IpcMainInvokeEventLike,
      payload: RegisterPayload,
    ) => {
      const { collectionName } = payload
      getCollection(collectionName)
      const subs = getSubscribers(collectionName)
      const sender = event.sender

      subs.add(sender)

      sender.once('destroyed', () => {
        subs.delete(sender)
        if (subs.size === 0) {
          teardownListeners(collectionName)
        }
      })

      setupListeners(collectionName)
    },
  )

  ipcMain.handle(
    SIGNALDB_UNREGISTER,
    async (
      event: IpcMainInvokeEventLike,
      payload: UnregisterPayload,
    ) => {
      const { collectionName } = payload
      getCollection(collectionName)
      const subs = getSubscribers(collectionName)

      subs.delete(event.sender)

      if (subs.size === 0) {
        teardownListeners(collectionName)
      }
    },
  )

  return {
    dispose() {
      ipcMain.removeHandler(SIGNALDB_LOAD)
      ipcMain.removeHandler(SIGNALDB_SAVE)
      ipcMain.removeHandler(SIGNALDB_REGISTER)
      ipcMain.removeHandler(SIGNALDB_UNREGISTER)

      for (const [collectionName] of subscribers) {
        teardownListeners(collectionName)
      }

      subscribers.clear()
      cleanups.clear()
    },
  }
}
