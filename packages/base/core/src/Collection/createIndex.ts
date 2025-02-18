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

      const includedKeys = keys.include == null
        // eslint-disable-next-line unicorn/prefer-array-flat
        ? [...index.values()].reduce<number[]>((memo, set) => [...memo, ...set], [])
        : keys.include.reduce<number[]>((memo, key) => [...memo, ...index.get(key) || []], [])

      const itemPositions = keys.exclude == null
        ? includedKeys
        : keys.exclude.reduce<number[]>((memo, key) =>
          memo.filter(i => !index.get(key)?.has(i)), includedKeys)

      return {
        matched: true,
        positions: itemPositions,
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
