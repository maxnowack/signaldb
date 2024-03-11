import createIndexProvider from '../createIndexProvider'
import type IndexProvider from '../types/IndexProvider'
import get from '../utils/get'
import getMatchingKeys from '../utils/getMatchingKeys'
import serializeValue from '../utils/serializeValue'
import type { BaseItem } from './types'

export function createExternalIndex<T extends BaseItem<I> = BaseItem, I = any>(
  field: string,
  index: Map<string, Set<number>>,
) {
  return createIndexProvider<T, I>({
    query(selector) {
      const keys = getMatchingKeys<T, I>(field, selector)
      if (keys == null) return { matched: false }
      const itemPositions = keys
        .reduce<number[]>((memo, key) => [...memo, ...index.get(key) || []], [])
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
