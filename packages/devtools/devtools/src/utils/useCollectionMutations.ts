import { useMemo } from 'react'
import dataStore from '../models/dataStore'

/**
 * Custom hook to get collection mutations from the data store.
 * @param collectionName - The name of the collection to filter mutations by.
 * @returns - An array of filtered mutations.
 */
export default function useCollectionMutations(collectionName: string) {
  const mutations = dataStore.useItem('mutations')
  return useMemo(() => {
    if (!mutations) return []
    return mutations.items
      .filter(q => q.collectionName === collectionName)
      .sort((a, b) => a.time - b.time)
      .reverse()
      .map(({ collectionName: _, time, ...item }) => ({ ...item, time: new Date(time as number) }))
  }, [mutations?.items, collectionName])
}
