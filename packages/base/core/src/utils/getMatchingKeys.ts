import type { BaseItem } from '../Collection/types'
import type { FlatSelector } from '../types/Selector'
import isFieldExpression from './isFieldExpression'
import serializeValue from './serializeValue'

/**
 * Extracts the matching keys for a given field in a selector.
 * Supports serialized values and `$in` field expressions for optimization.
 * Returns `null` if the field cannot be optimized.
 * @template T - The type of the items in the selector.
 * @template I - The type of the unique identifier for the items.
 * @param field - The name of the field to extract matching keys for.
 * @param selector - The selector object containing query criteria.
 * @returns An array of serialized matching keys for the field, or `null` if the field
 *   cannot be optimized (e.g., if it's a `RegExp` or non-optimizable field expression).
 */
export default function getMatchingKeys<
  T extends BaseItem<I> = BaseItem, I = any,
>(field: string, selector: FlatSelector<T>): string[] | null {
  if (selector[field] instanceof RegExp) return null
  if (selector[field] != null) {
    if (isFieldExpression(selector[field])) {
      const is$in = isFieldExpression(selector[field])
        && Array.isArray(selector[field].$in)
        && selector[field].$in.length > 0
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
