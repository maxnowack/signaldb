import { useMemo } from 'react'
import dataStore from '../models/dataStore'

/**
 * Custom hook to get collection queries from the data store.
 * @param collectionName - The name of the collection to filter queries by.
 * @returns - An array of filtered queries.
 */
export default function useCollectionQueries(collectionName: string) {
  const queries = dataStore.useItem('queries')
  return useMemo(() => {
    if (!queries) return []
    return queries.items
      .filter(q => q.collectionName === collectionName)
      .sort((a, b) => a.time - b.time)
      .reverse()
      .map(({ collectionName: _, lastTime, ...item }) => ({
        ...item,
        lastTime: new Date(lastTime as number),
      }))
  }, [queries?.items, collectionName])
}
