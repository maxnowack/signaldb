import { useMemo, useSyncExternalStore } from 'react'
import type { Collection } from '@signaldb/core'
import dataStore from '../models/dataStore'

type Item = Record<string, any> & { id: any }

const noItems: Item[] = []

/**
 * Custom hook to subscribe to collection items.
 * @param collectionName - The name of the collection to subscribe to.
 * @returns The items of the collection.
 */
export default function useCollectionItems(collectionName: string) {
  const collections = dataStore.useItem('collections')
  const collection = collections?.items.find(c => c.name === collectionName) as
    Collection<Item> | undefined
  const store = useMemo(() => {
    let snapshot = noItems
    return {
      subscribe: (onChange: () => void) => {
        if (!collection) return () => {}
        // Built from the observer's callbacks rather than `fetch()`: the devtools read
        // outside of any reactive scope, and the callbacks carry exactly what changed.
        const items = new Map<any, Item>()
        let scheduled = false
        const publish = () => {
          if (scheduled) return
          scheduled = true
          queueMicrotask(() => {
            scheduled = false
            snapshot = [...items.values()]
            onChange()
          })
        }
        const cursor = collection.find({})
        const stop = cursor.observeChanges({
          added: (item) => {
            items.set(item.id, item)
            publish()
          },
          changed: (item) => {
            items.set(item.id, item)
            publish()
          },
          removed: (item) => {
            items.delete(item.id)
            publish()
          },
        })
        return () => {
          stop()
          cursor.cleanup()
          snapshot = noItems
        }
      },
      getSnapshot: () => snapshot,
    }
  }, [collection])
  return useSyncExternalStore(store.subscribe, store.getSnapshot)
}
