import type { PersistenceAdapter } from '@signaldb/core'
import { createPersistenceAdapter } from '@signaldb/core'
import type { SignalDBBridge, ChangePayload } from './types'

declare global {
  var signaldb: SignalDBBridge | undefined
}

/**
 * @returns The SignalDB bridge from globalThis
 */
function getBridge(): SignalDBBridge {
  const bridge = globalThis.signaldb
  if (!bridge) {
    throw new Error(
      '@signaldb/electron: window.signaldb is not available. '
      + 'Make sure setupSignalDBPreload() is called in your preload script.',
    )
  }
  return bridge
}

/**
 * Creates a PersistenceAdapter that proxies calls through the IPC bridge.
 * @param collectionName - The name of the collection
 * @returns A PersistenceAdapter suitable for use with a Collection
 */
export function createElectronAdapter<
  T extends { id: I } & Record<string, any>,
  I = any,
>(collectionName: string): PersistenceAdapter<T, I> {
  let cleanupOnChange: (() => void) | undefined

  return createPersistenceAdapter<T, I>({
    async load() {
      return getBridge().load(collectionName)
    },
    async save(items, changes) {
      await getBridge().save(collectionName, items, changes)
    },
    async register(onChange) {
      const bridge = getBridge()
      cleanupOnChange = bridge.onChange(
        (payload: ChangePayload<T>) => {
          if (payload.collectionName === collectionName) {
            void onChange(payload.data)
          }
        },
      )
      await bridge.register(collectionName)
    },
    async unregister() {
      if (cleanupOnChange) {
        cleanupOnChange()
        cleanupOnChange = undefined
      }
      await getBridge().unregister(collectionName)
    },
  })
}
