import { describe, it, expect } from 'vitest'
import {
  watchEffect,
  nextTick,
  effectScope,
} from 'vue'
import { Collection } from '@signaldb/core'
import { SyncManager } from '@signaldb/sync'
import vueReactivityAdapter from '../src'

interface Item { id: string, name: string }

type RemoteData = { items: Item[] }

type RemoteChangeCallback = (data?: RemoteData) => Promise<void>

/**
 * Gives the sync manager the turns it needs to write the pulled data into the collection.
 * @returns A promise that resolves once the sync has settled.
 */
function settle() {
  return new Promise((resolve) => {
    setTimeout(resolve, 50)
  })
}

/**
 * Builds a collection driven by a sync manager whose remote changes are triggered by hand,
 * the way a real-time backend triggers them.
 * @returns The collection, the sync manager, the remote items to serve and the change trigger.
 */
function setupSyncedCollection() {
  const remote: RemoteData = { items: [] }
  let triggerRemoteChange: RemoteChangeCallback | undefined

  const syncManager = new SyncManager<Record<string, unknown>, Item, string>({
    pull: async () => ({ items: remote.items }),
    push: async () => { /* nothing is pushed in these tests */ },
    registerRemoteChange: (_collectionOptions, onChange) => {
      triggerRemoteChange = onChange
      return () => { /* nothing to clean up */ }
    },
  })
  const collection = new Collection<Item, string>({ reactivity: vueReactivityAdapter })
  syncManager.addCollection(collection, { name: 'items' })

  /**
   * Signals a remote change to the sync manager and waits for it to reach the collection.
   * @param data - The data to sync with, or nothing to make the sync manager pull.
   * @returns A promise that resolves once the change has been processed.
   */
  const notifyRemoteChange = async (data?: RemoteData) => {
    await triggerRemoteChange?.(data)
    await settle()
    await nextTick()
  }

  return {
    collection,
    remote,
    syncManager,
    notifyRemoteChange,
  }
}

/**
 * Observes a collection from a Vue effect the way a component does, recording what each run saw.
 * @param collection - The collection to observe.
 * @returns The recorded results of every run and the effect scope holding the effect.
 */
function observeFromVue(collection: Collection<Item, string>) {
  const seen: Item[][] = []
  const scope = effectScope()
  scope.run(() => {
    watchEffect((onCleanup) => {
      const cursor = collection.find()
      seen.push(cursor.fetch())
      onCleanup(() => cursor.cleanup())
    })
  })
  return { seen, scope }
}

describe('@signaldb/vue with @signaldb/sync', () => {
  it('reruns a watchEffect for every remote change that is pulled', async () => {
    const {
      collection, remote, syncManager, notifyRemoteChange,
    } = setupSyncedCollection()
    await syncManager.sync('items')
    await settle()

    const { seen, scope } = observeFromVue(collection)
    await nextTick()
    expect(seen.at(-1)).toEqual([])

    remote.items = [{ id: '1', name: 'John' }]
    await notifyRemoteChange()
    expect(seen.at(-1)).toEqual([{ id: '1', name: 'John' }])

    // The reported symptom only shows from the second remote change onwards: the first one
    // arrives, and every one after it is lost.
    remote.items = [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }]
    await notifyRemoteChange()
    expect(seen.at(-1)).toHaveLength(2)

    remote.items = [{ id: '2', name: 'Jane' }]
    await notifyRemoteChange()
    expect(seen.at(-1)).toEqual([{ id: '2', name: 'Jane' }])

    scope.stop()
    await syncManager.dispose()
  })

  it('reruns a watchEffect for every remote change that carries its data', async () => {
    const { collection, syncManager, notifyRemoteChange } = setupSyncedCollection()
    await syncManager.sync('items')
    await settle()

    const { seen, scope } = observeFromVue(collection)
    await nextTick()

    await notifyRemoteChange({ items: [{ id: '1', name: 'John' }] })
    expect(seen.at(-1)).toEqual([{ id: '1', name: 'John' }])

    await notifyRemoteChange({ items: [{ id: '1', name: 'John' }, { id: '2', name: 'Jane' }] })
    expect(seen.at(-1)).toHaveLength(2)

    scope.stop()
    await syncManager.dispose()
  })
})
