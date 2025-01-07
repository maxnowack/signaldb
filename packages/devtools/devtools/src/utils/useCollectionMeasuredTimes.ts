import { useMemo } from 'react'
import dataStore from '../models/dataStore'

/**
 * Custom hook to get collection measuredTimes from the data store.
 * @param collectionName - The name of the collection to filter measuredTimes by.
 * @returns - An array of filtered measuredTimes.
 */
export default function useCollectionMeasuredTimes(collectionName: string) {
  const measuredTimes = dataStore.useItem('measuredTimes')
  return useMemo(() => {
    if (!measuredTimes) return []
    return measuredTimes.items
      .filter(q => q.collectionName === collectionName)
      .sort((a, b) => a.measuredTime - b.measuredTime)
      .reverse()
      .map(({ collectionName: _, time, ...item }) => ({ ...item, time: new Date(time as number) }))
  }, [measuredTimes?.items, collectionName])
}
