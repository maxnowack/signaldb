import type { BaseItem } from '../Collection/types'
import type { FlatSelector } from '../types/Selector'
import isFieldExpression from './isFieldExpression'
import serializeValue from './serializeValue'

type KeyResult = {
  include: string[] | null,
  exclude: string[] | null,
}

/**
 * Extracts the matching and excluded keys for a given field in a selector.
 * Supports serialized values and `$in`/`$nin` field expressions for optimization.
 * Returns `null` for include/exclude if the field cannot be optimized.
 * @template T - The type of the items in the selector.
 * @template I - The type of the unique identifier for the items.
 * @param field - The name of the field to extract matching keys for.
 * @param selector - The selector object containing query criteria.
 * @returns An object containing arrays of serialized included and excluded keys,
 *   or `null` if the field cannot be optimized.
 */
export default function getMatchingKeys<
  T extends BaseItem<I> = BaseItem, I = any,
>(field: string, selector: FlatSelector<T>): KeyResult {
  const result: KeyResult = { include: null, exclude: null }
  const fieldSelector = (selector as Record<string, any>)[field]

  if (fieldSelector instanceof RegExp) return result
  if (fieldSelector == null) return result

  if (isFieldExpression(fieldSelector)) {
    // Handle $ne operator
    if (fieldSelector.$ne != null) {
      result.exclude = [serializeValue(fieldSelector.$ne)]
      return result
    }

    // Handle $in operator
    if (Array.isArray(fieldSelector.$in) && fieldSelector.$in.length > 0) {
      result.include = fieldSelector.$in.map(serializeValue)
      return result
    }

    // Handle $nin operator
    if (Array.isArray(fieldSelector.$nin) && fieldSelector.$nin.length > 0) {
      result.exclude = fieldSelector.$nin.map(serializeValue)
      return result
    }

    // If there are other operators, we can't optimize
    return { include: null, exclude: null }
  }

  // Direct value match
  result.include = [serializeValue(fieldSelector)]
  return result
}
