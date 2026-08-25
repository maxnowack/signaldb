import type { BaseItem } from '../Collection/types'
import type StorageAdapter from '../types/StorageAdapter'
import type { AsynchronousQueryFunction, IndexResult } from '../types/IndexProvider'
import type { FlatSelector } from '../types/Selector'
import getMatchingKeys from './getMatchingKeys'

/**
 * Builds the index provider a data adapter uses to narrow a selector down through
 * a storage adapter's index.
 *
 * Every adapter that keeps its data in a `StorageAdapter` needs exactly this, and
 * each of them used to carry its own copy — three transcriptions of one set of
 * rules about null, `$exists`, inclusion and exclusion, which is how they drift
 * apart without anyone noticing. The index is keyed by `serializeValue(value)`,
 * which is what `getMatchingKeys` produces, so the two only agree while they stay
 * in one place.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param storage - The storage adapter holding the index.
 * @param field - The indexed field this provider answers for.
 * @returns A query function for `getIndexInfo`.
 */
export default function storageIndexQuery<T extends BaseItem<I>, I = any>(
  storage: Pick<StorageAdapter<T, I>, 'readIndex'>,
  field: string,
): AsynchronousQueryFunction<T, I> {
  return async (flatSelector: FlatSelector<T>): Promise<IndexResult<I>> => {
    if (!Object.hasOwnProperty.call(flatSelector, field)) {
      // The field is not in the selector, so this index says nothing about it.
      return { matched: false }
    }

    const index = await storage.readIndex(field)
    const fieldSelector = (flatSelector as Record<string, unknown>)[field] as
      { $exists?: boolean } | null | undefined
    // A query for null, or for the field being absent, is the one case the index
    // cannot answer by naming keys — it is answered by naming every key it is
    // *not*, and the selector has to stay for the matcher to confirm it.
    const filtersForNull = fieldSelector == null || fieldSelector.$exists === false
    const keys = filtersForNull
      ? { include: null, exclude: [...index.keys()].filter(key => key != null) }
      : getMatchingKeys<T, I>(field, flatSelector)
    if (keys.include == null && keys.exclude == null) return { matched: false }

    let includedIds: I[] = []
    if (keys.include == null) {
      for (const set of index.values()) {
        for (const id of set) includedIds.push(id)
      }
    } else {
      for (const key of keys.include) {
        const idSet = index.get(key)
        if (idSet) {
          for (const id of idSet) includedIds.push(id)
        }
      }
    }

    if (keys.exclude != null) {
      const excludedIds = new Set<I>()
      for (const key of keys.exclude) {
        const idSet = index.get(key)
        if (idSet) {
          for (const id of idSet) excludedIds.add(id)
        }
      }
      includedIds = includedIds.filter(id => !excludedIds.has(id))
    }

    return {
      matched: true,
      ids: includedIds,
      fields: [field],
      keepSelector: filtersForNull,
    }
  }
}
