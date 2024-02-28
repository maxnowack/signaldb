import createIndexProvider from '../createIndexProvider'
import type { FlatSelector } from '../types/Selector'
import get from '../utils/get'
import isFieldExpression from '../utils/isFieldExpression'
import type { BaseItem } from './types'

export function serializeValue(value: any) {
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'boolean') return value.toString()
  if (value instanceof Date) return value.toISOString()
  return JSON.stringify(value)
}

export function getMatchingKeys<
  T extends BaseItem<I> = BaseItem, I = any
>(field: string, selector: FlatSelector<T>): string[] | null {
  if (selector[field] instanceof RegExp) return null
  if (selector[field] != null) {
    if (isFieldExpression(selector[field])) {
      const is$in = isFieldExpression(selector[field])
        && Array.isArray(selector[field].$in)
        && selector[field].$in.length
      if (is$in) {
        const optimizedSelector = { ...selector, [field]: { ...selector[field] } }
        delete optimizedSelector[field].$in
        if (Object.keys(optimizedSelector[field] as object).length === 0) {
          delete optimizedSelector[field]
        }

        return (selector[field].$in as I[]).map(serializeValue)
      }
      return null
    }
    return [serializeValue(selector[field])]
  }

  return null
}

export default function createIndex<T extends BaseItem<I> = BaseItem, I = any>(field: string) {
  const index = new Map<string, Set<number>>()

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
    rebuild(items) {
      index.clear()
      items.forEach((item, i) => {
        const value = serializeValue(get(item, field))
        const current = index.get(value) || new Set<number>()
        current.add(i)
        index.set(value, current)
      })
    },
  })
}
