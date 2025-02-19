import createIndexProvider from '../createIndexProvider'
import type IndexProvider from '../types/IndexProvider'
import get from '../utils/get'
import getMatchingKeys from '../utils/getMatchingKeys'
import serializeValue from '../utils/serializeValue'
import type { BaseItem } from './types'

/**
 * creates an index for a specific field but uses an external map to store the index
 * @param field name of the field
 * @param index the external map to use for the index
 * @returns an index provider to pass to the `indices` option of the collection constructor
 */
export function createExternalIndex<T extends BaseItem<I> = BaseItem, I = any>(
  field: string,
  index: Map<string, Set<number>>,
) {
  return createIndexProvider<T, I>({
    query(selector) {
      const keys = getMatchingKeys<T, I>(field, selector)
      if (keys.include == null && keys.exclude == null) return { matched: false }

      // Accumulate included positions
      let includedPositions: number[] = []
      if (keys.include == null) {
        for (const set of index.values()) {
          for (const pos of set) {
            includedPositions.push(pos)
          }
        }
      } else {
        for (const key of keys.include) {
          const posSet = index.get(key)
          if (posSet) {
            for (const pos of posSet) {
              includedPositions.push(pos)
            }
          }
        }
      }

      // If exclusion is specified, build a single set of all positions to exclude.
      if (keys.exclude != null) {
        const excludeSet = new Set<number>()
        for (const key of keys.exclude) {
          const posSet = index.get(key)
          if (posSet) {
            for (const pos of posSet) {
              excludeSet.add(pos)
            }
          }
        }
        // Filter out any position that exists in the exclude set.
        includedPositions = includedPositions.filter(pos => !excludeSet.has(pos))
      }

      return {
        matched: true,
        positions: includedPositions,
        fields: [field],
      }
    },
    rebuild() {
      // rebuilding is done externally
    },
  })
}

/**
 * creates an index for a specific field
 * @param field name of the field
 * @returns an index provider to pass to the `indices` option of the collection constructor
 */
export default function createIndex<T extends BaseItem<I> = BaseItem, I = any>(field: string) {
  const index = new Map<string, Set<number>>()
  return {
    ...createExternalIndex<T, I>(field, index),
    rebuild(items) {
      index.clear()
      items.forEach((item, i) => {
        const value = serializeValue(get(item, field))
        const current = index.get(value) || new Set<number>()
        current.add(i)
        index.set(value, current)
      })
    },
  } as IndexProvider<T, I>
}
