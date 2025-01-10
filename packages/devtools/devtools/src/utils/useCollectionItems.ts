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
      collection.on('insert', onChange)
      collection.on('updateOne', onChange)
      collection.on('updateMany', onChange)
      collection.on('removeOne', onChange)
      collection.on('removeMany', onChange)
      return () => {
        collection.off('insert', onChange)
        collection.off('updateOne', onChange)
        collection.off('updateMany', onChange)
        collection.off('removeOne', onChange)
        collection.off('removeMany', onChange)
      }
    },
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    () => collection?.options.memory,
  )
}
