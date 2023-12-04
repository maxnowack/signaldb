import createIndexProvider from '../createIndexProvider'
import type Selector from '../types/Selector'
import compact from '../utils/compact'
import get from '../utils/get'
import intersection from '../utils/intersection'
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
>(field: string, selector: Selector<T>): string[] | null {
  if (selector[field] instanceof RegExp) return null
  if (selector[field] != null) {
    if (isFieldExpression(selector[field])) {
      const is$in = isFieldExpression(selector[field])
        && Array.isArray(selector[field].$in)
        && selector[field].$in.length
      if (is$in) return selector[field].$in as string[]
      return null
    }
    return [serializeValue(selector[field])]
  }

  if (Array.isArray(selector.$and)) {
    const subArrays = selector.$and.map(sel => getMatchingKeys(field, sel))
    const subKeys = compact(subArrays)
    if (subKeys.length === 0) return null
    return intersection(...subKeys)
  }

  if (Array.isArray(selector.$or)) {
    const subArrays = selector.$or.map(sel => getMatchingKeys(field, sel))
    const subKeys = compact(subArrays)
    if (subKeys.length === 0) return null
    return subKeys.reduce<string[]>((memo, keys) => [...memo, ...keys], [])
  }

  return null
}

export default function createIndex<T extends BaseItem<I> = BaseItem, I = any>(field: string) {
  const index = new Map<string, Set<number>>()

  return createIndexProvider<T, I>({
    getItemPositions(selector) {
      const matchingKeys = getMatchingKeys<T, I>(field, selector)
      if (matchingKeys == null) return null
      const itemPositions = matchingKeys
        .reduce<number[]>((memo, key) => [...memo, ...index.get(key) || []], [])
      return itemPositions
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
