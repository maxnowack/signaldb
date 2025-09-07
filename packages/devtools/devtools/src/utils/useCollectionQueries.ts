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
      .toSorted((a, b) => a.time - b.time)
      .toReversed()
      .map(({ collectionName: _, lastTime, ...item }) => ({
        id: item.id,
        collectionName: item.collectionName,
        lastTime: new Date(lastTime as number),
        count: item.count,
        selector: item.selector,
        options: item.options,
        callstack: item.callstack,
      }))
  }, [queries?.items, collectionName])
}
