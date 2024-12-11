import type { BaseItem } from '../Collection/types'
import type { FlatSelector } from '../types/Selector'
import isFieldExpression from './isFieldExpression'
import serializeValue from './serializeValue'

export default function getMatchingKeys<
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
