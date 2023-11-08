import type IndexProvider from '../types/IndexProvider'
import type Selector from '../types/Selector'
import compact from '../utils/compact'
import intersection from '../utils/intersection'
import isFieldExpression from '../utils/isFieldExpression'
import type { BaseItem } from './types'

export function getMatchingIds<
  T extends BaseItem<I> = BaseItem, I = any
>(selector: Selector<T>): I[] | null {
  if (selector.id instanceof RegExp) return null
  if (selector.id != null) {
    if (isFieldExpression(selector.id)) {
      const is$in = isFieldExpression(selector.id)
        && Array.isArray(selector.id.$in)
        && selector.id.$in.length
      if (is$in) return selector.id.$in as I[]
      return null
    }
    return [selector.id] as I[]
  }

  if (Array.isArray(selector.$and)) {
    const subIdArrays = selector.$and.map(sel => getMatchingIds(sel))
    const subIds = compact(subIdArrays)
    if (subIds.length === 0) return null
    return intersection(...subIds)
  }

  return null
}

export default function createIdIndex<
  T extends BaseItem<I> = BaseItem, I = any
>(): IndexProvider<T, I> {
  const index = new Map<I, number>()

  return {
    getItemPositions(selector) {
      const matchingIds = getMatchingIds<T, I>(selector)
      if (matchingIds == null) return null
      const resolvedPositions = matchingIds.map(id => index.get(id))
        .filter(pos => pos != null)
      return resolvedPositions as number[]
    },
    rebuild(items) {
      index.clear()
      items.forEach((item, i) => {
        index.set(item.id, i)
      })
    },
  }
}
