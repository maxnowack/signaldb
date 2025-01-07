import { useSyncExternalStore } from 'react'
import type { Collection } from '@signaldb/core'
import dataStore from '../models/dataStore'

/**
 * Custom hook to subscribe to collection items.
 * @param collectionName - The name of the collection to subscribe to.
 * @returns The items of the collection.
 */
export default function useCollectionItems(collectionName: string) {
  const collections = dataStore.useItem('collections')
  const collection = collections?.items.find(c => c.name === collectionName) as Collection<any>
  return useSyncExternalStore(
    (onChange) => {
      if (!collection) return () => {}
      collection.on('added', onChange)
      collection.on('changed', onChange)
      collection.on('removed', onChange)
      return () => {
        collection.off('added', onChange)
        collection.off('changed', onChange)
        collection.off('removed', onChange)
      }
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    () => collection?.options.memory,
  )
}
