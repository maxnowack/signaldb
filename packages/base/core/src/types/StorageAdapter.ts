import type { BaseItem, FieldSpecifier, SortSpecifier } from '../Collection'
import type Selector from './Selector'

export interface Changeset<T> {
  added: T[],
  modified: T[],
  removed: T[],
}

/**
 * What a caller wants answered, in one piece.
 *
 * The same four options a query carries (`DataAdapter`'s `QueryOptions`) plus
 * the selector, so an adapter that can push some of them down to its backing
 * store sees the whole question rather than a filter at a time.
 */
export interface StorageQuery<T extends BaseItem> {
  selector: Selector<T>,
  sort?: SortSpecifier<T> | undefined,
  skip?: number | undefined,
  limit?: number | undefined,
  fields?: FieldSpecifier<T> | undefined,
}

/**
 * What an adapter answered, and how much of the question it actually took on.
 *
 * Every flag defaults to "no": an adapter says only what it did, and the
 * caller does the rest in JavaScript, exactly as it does for an adapter with
 * no `query` at all. That is what makes partial support the normal case rather
 * than a special one — an adapter may translate an equality and decline a
 * `$regex`, or sort but not window, and never has to understand a selector it
 * does not recognise.
 *
 * Three combinations are contradictions rather than choices, and
 * `executeStorageQuery` throws on them rather than returning a wrong result
 * quietly:
 *
 * - `windowed` without having applied the whole selector — the rows it dropped
 *   at the window's edge may be rows the caller was going to filter out, so the
 *   window is over the wrong set and nothing can repair it.
 * - `windowed` without `sorted`, when a sort was asked for — the same, one step
 *   earlier: a window over an unordered set is an arbitrary subset.
 * - `projected` without `sorted`, when the sort is on a field the projection
 *   dropped — the caller is then asked to sort by something that is no longer
 *   there. This is the trap `incrementalQueryUpdate` already documents.
 */
export interface StorageQueryAnswer<T extends BaseItem> {
  items: T[],
  /**
   * The part of the selector the adapter could *not* apply, for the caller to
   * evaluate over `items`. Omit it, or give `{}`, to say the whole selector was
   * applied. This mirrors `getIndexInfo`'s `optimizedSelector`: an adapter
   * narrows as far as it can and hands back what is left.
   */
  residualSelector?: Selector<T>,
  /** The items are in the requested order. */
  sorted?: boolean,
  /** `skip` and `limit` have already been applied. */
  windowed?: boolean,
  /** The items already carry only the requested fields. */
  projected?: boolean,
}

export default interface StorageAdapter<T extends { id: I } & Record<string, any>, I> {
  // lifecycle methods
  setup(): Promise<void>,
  teardown(): Promise<void>,

  // data retrieval methods
  readAll(): Promise<T[]>,
  readIds(positions: I[]): Promise<T[]>,
  /**
   * Answers a whole query — predicate, order, window and projection — as far as
   * the backing store can.
   *
   * **Optional, and a pure optimisation.** An adapter that does not implement
   * it is read through `readIds`/`readAll` and filtered, sorted, windowed and
   * projected in JavaScript, which is what every adapter did before this
   * existed and what several of them can only ever do: a store that holds one
   * blob — `localstorage`, `fs`, `opfs` — has no way to answer less than all of
   * it, and implementing this to do the same work behind a new name would buy
   * nothing.
   *
   * It exists because without it there is no way to *express* a bounded read.
   * `limit` costs exactly what no limit costs when the store hands over every
   * matching row first, so nobody writes one, and a query over a table that
   * grows with a user's history stays proportional to that history however
   * carefully its consumer is written.
   *
   * An adapter may always answer less than it was asked; see
   * `StorageQueryAnswer` for what it must not claim.
   */
  query?(query: StorageQuery<T>): Promise<StorageQueryAnswer<T>>,

  // index methods
  createIndex(field: string): Promise<void>,
  dropIndex(field: string): Promise<void>,
  /**
   * The index, keyed by `serializeValue(value)` — not by the raw field value.
   *
   * SignalDB looks an index up with the serialized form, because that is what
   * makes `3`, `'3'` and `new Date(...)` comparable as map keys at all. An
   * adapter that stores its backend's own keys instead answers nothing for
   * every non-string field, and everything for a `$ne` on one.
   *
   * Never consulted for a query an adapter answered through `query` itself —
   * that adapter's own store already did the narrowing this index exists for.
   */
  readIndex(field: string): Promise<Map<string | null, Set<I>>>,

  // data manipulation methods
  insert(items: T[]): Promise<void>,
  replace(items: T[]): Promise<void>,
  remove(items: T[]): Promise<void>,
  removeAll(): Promise<void>,
}
