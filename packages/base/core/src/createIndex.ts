import createIndexProvider from './createIndexProvider'
import get from './utils/get'
import getMatchingKeys from './utils/getMatchingKeys'
import serializeValue from './utils/serializeValue'
import type { BaseItem } from './Collection/types'

/**
 * creates an index for a specific field
 * @param field name of the field
 * @returns an index provider to pass to the `indices` option of the collection constructor
 */
export default function createIndex<T extends BaseItem<I> = BaseItem, I = any>(field: string) {
  const index = new Map<string | undefined | null, Set<I>>()
  return createIndexProvider<T, I>({
    query(selector) {
      if (!Object.hasOwnProperty.call(selector, field)) {
        // If the field is not present in the selector, we can't optimize
        return { matched: false }
      }

      const fieldSelector = (selector as Record<string, any>)[field]
      const filteresForNull = fieldSelector == null || fieldSelector.$exists === false
      const keys = filteresForNull
        ? { include: null, exclude: [...index.keys()].filter(key => key != null) }
        : getMatchingKeys<T, I>(field, selector)
      if (keys.include == null && keys.exclude == null) return { matched: false }

      // Accumulate included positions
      let includedIds: I[] = []
      if (keys.include == null) {
        for (const set of index.values()) {
          for (const pos of set) {
            includedIds.push(pos)
          }
        }
      } else {
        for (const key of keys.include) {
          const posSet = index.get(key)
          if (posSet) {
            for (const pos of posSet) {
              includedIds.push(pos)
            }
          }
        }
      }

      // If exclusion is specified, build a single set of all positions to exclude.
      if (keys.exclude != null) {
        const excludeIds = new Set<I>()
        for (const key of keys.exclude) {
          const posSet = index.get(key)
          if (posSet) {
            for (const pos of posSet) {
              excludeIds.add(pos)
            }
          }
        }
        // Filter out any position that exists in the exclude set.
        includedIds = includedIds.filter(pos => !excludeIds.has(pos))
      }

      return {
        matched: true,
        ids: includedIds,
        fields: [field],
        keepSelector: filteresForNull,
      }
    },
    rebuild(items) {
      index.clear()
      items.forEach((item) => {
        const value = serializeValue(get(item, field))
        const current = index.get(value) || new Set<I>()
        current.add(item.id)
        index.set(value, current)
      })
    },
  })
}
