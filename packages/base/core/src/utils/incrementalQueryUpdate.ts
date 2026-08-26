import type { QueryOptions } from '../DataAdapter'
import type { BaseItem, SortSpecifier } from '../Collection/types'
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
 * - `fields` together with a `sort` the projection does not keep: the previous items are
 *   projected, so a sort key the projection dropped is no longer there to sort by. A projection
 *   that keeps every sort key is fine, and is the common case — a list sorted by the same date it
 *   displays.
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
  if (skip != null) return null
  if (fields != null && sort != null && !sortKeysSurviveProjection(sort, fields)) return null
  if (limit != null && !windowStaysClosed(previous, selector, options, changes)) return null
  return mergeChangesetIntoResult(previous, selector, options, changes)
}

/**
 * Whether a projection keeps every field a sort is keyed on.
 *
 * The previous result is the projected items, so this decides whether they still carry what the
 * sort needs. Both projection modes are covered, because `project` treats an all-zero spec as an
 * exclusion and anything else as an inclusion:
 *
 * - An inclusion keeps a key when the key itself is included, or an ancestor of it is (`{a: 1}`
 *   keeps `a.b`), and always keeps `id` unless the spec excludes it outright.
 * - An exclusion keeps a key unless the key or an ancestor of it is excluded.
 *
 * Anything it cannot account for is a "no": re-executing is slower, not wrong.
 * @template T - The type of the items.
 * @param sort - The query's sort.
 * @param fields - The query's projection.
 * @returns `true` when every sort key survives the projection.
 */
function sortKeysSurviveProjection<T extends BaseItem>(
  sort: SortSpecifier<T>,
  fields: NonNullable<QueryOptions<T>['fields']>,
): boolean {
  const entries = Object.entries(fields)
  if (entries.length === 0) return true
  const isExclusion = entries.every(([, value]) => value === 0)
  // `a.b.c` is kept by `a`, by `a.b` and by `a.b.c`, and dropped by any of them under an
  // exclusion — so both modes ask about the key and each of its ancestors.
  const pathsFor = (key: string) => key
    .split('.')
    .map((_, index, parts) => parts.slice(0, index + 1).join('.'))

  return Object.keys(sort).every((key) => {
    const paths = pathsFor(key)
    if (isExclusion) return paths.every(path => fields[path] !== 0)
    if (key === 'id') return fields.id !== 0
    return paths.some(path => fields[path] === 1)
  })
}

/**
 * Whether two items are in the given order under the given sort, deciding ties against the caller.
 *
 * Uses the sort itself rather than a comparator of its own: a rule about which side of a window an
 * item falls on is only as good as its agreement with the ordering that drew the window. A tie
 * comes back as `false`, because a tie is exactly the case where an item could belong on either
 * side and the answer has to be taken from the store.
 * @template T - The type of the items.
 * @param item - The item whose position is in question.
 * @param edge - The item at the edge of the window.
 * @param sort - The query's sort.
 * @returns `true` when `item` sorts strictly before `edge`.
 */
function sortsBefore<T extends BaseItem>(item: T, edge: T, sort: SortSpecifier<T>): boolean {
  return sortItems([edge, item], sort)[0] === item
}

/**
 * Whether a change to a windowed query can be answered from the window alone.
 *
 * A window holds the first `limit` items in sort order, and nothing about what lies beyond it. An
 * item leaving the window therefore has to be replaced by one the window has never seen, and that
 * answer can only come from the store. An item arriving is a different matter: it takes its place
 * and pushes the last one out, and where that one goes is not the window's problem.
 *
 * The one case where none of this applies is a window that was never full, because then the query
 * already returns everything it matches and there is no "beyond".
 * @template T - The type of the items.
 * @param previous - The query's previous result.
 * @param selector - The query's selector.
 * @param options - The query's options.
 * @param changes - The items the write created, updated or removed.
 * @returns `true` when the new window follows from the old one and the change.
 */
function windowStaysClosed<T extends BaseItem>(
  previous: T[],
  selector: Selector<T>,
  options: QueryOptions<T> | undefined,
  changes: QueryChangeset<T>,
): boolean {
  const { sort, limit, fields } = options || {}
  if (limit == null || previous.length < limit) return true
  // A full window needs an edge to compare against, and comparing needs the field the sort is on
  // to still be there.
  if (sort == null || fields != null) return false

  const edge = previous.at(-1) as T
  const runnerUp = previous.at(-2)
  // Which item is *the* edge has to be beyond doubt. Two items sorting equally at the end of the
  // window are interchangeable, and so is the question of which of them a write displaces.
  if (runnerUp != null && !sortsBefore(runnerUp, edge, sort)) return false

  const inWindow = new Set(previous.map(item => item.id))
  if (changes.deletes.some(id => inWindow.has(id))) return false
  return changes.upserts.every((item) => {
    if (item === edge) return true
    const before = sortsBefore(item, edge, sort)

    if (!inWindow.has(item.id)) {
      // Coming from outside: it either takes a place inside, displacing the edge, or stays where
      // it was. Sorting *equally* to the edge is the one answer the window cannot give, because
      // the store may just as well have kept the edge and left this one out.
      if (!match(item, selector)) return true
      return before || sortsBefore(edge, item, sort)
    }

    // An item that no longer matches leaves a place open, and what fills it is beyond the window.
    if (!match(item, selector)) return false
    if (before) return true
    // Not before the edge. The one item that may sit *on* the edge is the edge itself, and only
    // while it has not actually moved — an edge that slides outwards gives up the last place, and
    // what takes it is something the window has never seen.
    return item.id === edge.id && !sortsBefore(edge, item, sort)
  })
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
