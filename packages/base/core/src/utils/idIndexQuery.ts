import type { BaseItem } from '../Collection/types'
import type { IndexResult } from '../types/IndexProvider'
import type { FlatSelector } from '../types/Selector'
import isFieldExpression from './isFieldExpression'

/**
 * Resolves a selector on `id` into the ids it names, without consulting an index.
 *
 * `id` is the one field every storage adapter can look up directly — that is what
 * `readIds` is — so a query on it never needs an index to be declared and never
 * needs the whole collection to be read. This behaves like an index provider that
 * happens to need no stored index, because the ids are already in the selector.
 *
 * Only inclusive forms can be answered this way. `$ne`/`$nin` describe everything
 * except* something, which cannot be enumerated without knowing every id, so they
 * report no match and take the ordinary path.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param selector - The flat selector to resolve.
 * @returns An index result naming the matched ids, or `{ matched: false }`.
 */
export default function idIndexQuery<T extends BaseItem<I> = BaseItem, I = any>(
  selector: FlatSelector<T>,
): IndexResult<I> {
  if (selector == null || !Object.hasOwnProperty.call(selector, 'id')) return { matched: false }
  const fieldSelector = (selector as Record<string, any>).id
  if (fieldSelector == null || fieldSelector instanceof RegExp) return { matched: false }

  if (isFieldExpression(fieldSelector)) {
    const values = fieldSelector.$in
    if (!Array.isArray(values) || values.length <= 0) return { matched: false }
    return {
      matched: true,
      ids: values as I[],
      fields: ['id'],
      keepSelector: false,
    }
  }

  if (typeof fieldSelector === 'object') return { matched: false }
  return {
    matched: true,
    ids: [fieldSelector as I],
    fields: ['id'],
    keepSelector: false,
  }
}
