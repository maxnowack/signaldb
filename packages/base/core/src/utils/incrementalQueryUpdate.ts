import type { QueryOptions } from '../DataAdapter'
import type { BaseItem } from '../Collection/types'
import type Selector from '../types/Selector'
import match from './match'
import projectItems from './projectItems'
import sortItems from './sortItems'

/**
 * The items a write created, updated or removed, from the point of view of a store.
 *
 * `upserts` are the *current* state of every item that still exists; `deletes` are the ids of items
 * that no longer do. A write that changes an item's id contributes to both. Callers are responsible
 * for that split — an "affected items" list holding an item's state from before and after a write
 * cannot be told apart from two unrelated items here.
 */
export interface QueryChangeset<T extends BaseItem> {
  upserts: T[],
  deletes: any[],
}

/**
 * Recomputes a query's result from its previous result and the change that was just written,
 * without going back to the store.
 *
 * A store re-executing the query instead reads every item it holds (or every item an index points
 * at) and filters, sorts and projects the lot — for a write that touched one row. This does the
 * same job in the size of the write, which is what a query's result costs to keep up to date when
 * the change that affects it is already in hand.
 *
 * Returns `null` when the previous result is not enough to answer, and the caller has to re-execute
 * the query after all:
 * - `limit` or `skip`: the result is a window onto a larger set, and an item leaving the window has
 *   to be replaced by one the previous result never contained.
 * - `fields` together with `sort`: the previous items are projected, so the field the sort is keyed
 *   on may no longer be there to sort by.
 * - a `null` selector, which matches nothing and is not worth a special case.
 * @template T - The type of the items.
 * @param previous - The query's previous result.
 * @param selector - The query's selector.
 * @param options - The query's options.
 * @param changes - The items the write created, updated or removed.
 * @returns The new result, or `null` when the query has to be re-executed.
 */
export default function incrementalQueryUpdate<T extends BaseItem>(
  previous: T[],
  selector: Selector<T>,
  options: QueryOptions<T> | undefined,
  changes: QueryChangeset<T>,
): T[] | null {
  if (selector == null) return null
  const { sort, skip, limit, fields } = options || {}
  if (limit != null || skip != null) return null
  if (fields != null && sort != null) return null
  return mergeChangesetIntoResult(previous, selector, options, changes)
}

/**
 * Folds a change into a query's result, whatever the query's options.
 *
 * The unguarded version of `incrementalQueryUpdate`, for the places where the alternative is not a
 * more accurate answer but a wrong one — layering a write that has not been confirmed yet on top of
 * the last confirmed result, say. For a query returning everything it matches, this is exact. For a
 * window onto a larger set it is the closest the window itself can get: an item that no longer
 * belongs is dropped, one that does is placed, and the window is trimmed back to its length — but
 * an item pulled in from beyond the window is not something the window knows about.
 *
 * What it never does is re-examine the items already in the result. They matched when the store
 * produced them, they still match, and asking again is both wasteful and — for a projected result,
 * whose items no longer carry the fields the selector names — wrong.
 * @template T - The type of the items.
 * @param previous - The query's previous result.
 * @param selector - The query's selector.
 * @param options - The query's options.
 * @param changes - The items the write created, updated or removed.
 * @returns The resulting items.
 */
export function mergeChangesetIntoResult<T extends BaseItem>(
  previous: T[],
  selector: Selector<T>,
  options: QueryOptions<T> | undefined,
  changes: QueryChangeset<T>,
): T[] {
  if (selector == null) return []
  const { sort, limit, fields } = options || {}

  const byId = new Map<any, T>()
  previous.forEach(item => byId.set(item.id, item))
  changes.deletes.forEach(id => byId.delete(id))
  changes.upserts.forEach((item) => {
    // Matched against the unprojected item: the selector is free to name fields the projection
    // drops, and the stored result would have no answer for those.
    if (match(item, selector)) {
      byId.set(item.id, projectItems([item], fields)[0])
    } else {
      byId.delete(item.id)
    }
  })

  const items = [...byId.values()]
  const sorted = sort ? sortItems(items, sort) : items
  return limit == null ? sorted : sorted.slice(0, limit)
}
