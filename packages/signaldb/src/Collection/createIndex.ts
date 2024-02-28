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
>(field: string, selector: Selector<T>): { keys: string[], optimizedSelector: Selector<T> } | null {
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

        return {
          keys: (selector[field].$in as I[]).map(serializeValue),
          optimizedSelector,
        }
      }
      return null
    }
    const optimizedSelector = { ...selector }
    delete optimizedSelector[field]
    return {
      keys: [serializeValue(selector[field])],
      optimizedSelector,
    }
  }

  const { $and, $or } = selector
  if (Array.isArray($and)) {
    const subArrays = $and.map(sel => getMatchingKeys(field, sel))

    if (subArrays.every(i => !i)) return null

    const optimizedSelector = { ...selector }
    // apply optimized selectors
    optimizedSelector.$and = subArrays.map((result, index) => {
      if (result == null) return $and[index]
      return result.optimizedSelector
    })
    // delete empty selectors
    optimizedSelector.$and = optimizedSelector.$and
      .filter(item => item != null && Object.keys(item).length > 0)
    if (optimizedSelector.$and.length === 0) delete optimizedSelector.$and

    return {
      keys: intersection(...compact(subArrays).map(i => i.keys)),
      optimizedSelector,
    }
  }

  if (Array.isArray($or)) {
    const subArrays = $or.map(sel => getMatchingKeys(field, sel))
    if (subArrays.every(i => !i)) return null

    const optimizedSelector = { ...selector }
    // apply optimized selectors
    optimizedSelector.$or = subArrays.map((result, index) => {
      if (result == null) return $or[index]
      return result.optimizedSelector
    })
    // delete empty selectors
    optimizedSelector.$or = optimizedSelector.$or
      .filter(item => item != null && Object.keys(item).length > 0)
    if (optimizedSelector.$or.length === 0) delete optimizedSelector.$or

    return {
      keys: compact(subArrays).map(i => i.keys)
        .reduce<string[]>((memo, keys) => [...memo, ...keys], []),
      optimizedSelector,
    }
  }

  return null
}

export default function createIndex<T extends BaseItem<I> = BaseItem, I = any>(field: string) {
  const index = new Map<string, Set<number>>()

  return createIndexProvider<T, I>({
    query(selector) {
      const match = getMatchingKeys<T, I>(field, selector)
      if (match == null) return { matched: false }
      const { keys, optimizedSelector } = match
      const itemPositions = keys
        .reduce<number[]>((memo, key) => [...memo, ...index.get(key) || []], [])
      return { matched: true, positions: itemPositions, optimizedSelector }
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
