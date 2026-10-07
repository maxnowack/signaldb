import type { BaseItem, FieldSpecifier, SortSpecifier } from './Collection'
import type Collection from './Collection'
import type Modifier from './types/Modifier'
import type Selector from './types/Selector'
import type { QueryDelta } from './utils/queryDelta'

/**
 * The options of a query besides its selector.
 * @template T - The type of the items queried.
 */
export interface QueryOptions<T extends BaseItem> {
  /** Sort order (default: natural order) */
  sort?: SortSpecifier<T> | undefined,
  /** Number of results to skip at the beginning */
  skip?: number | undefined,
  /** Maximum number of results to return */
  limit?: number | undefined,
  /** Dictionary of fields to return or exclude. */
  fields?: FieldSpecifier<T> | undefined,
}

/**
 * Notified when a query's state changes.
 *
 * A `'complete'` notification may carry a delta describing how the result changed since the last
 * one. An adapter that can produce one saves its listeners from rediscovering the change by
 * comparing the whole result against the whole previous result; one that cannot simply omits it,
 * and its listeners fall back to exactly that comparison.
 *
 * `'active'` means the query is being executed, `'complete'` that its result is available
 * through `getQueryResult`, `'error'` that it failed (see `getQueryError`).
 *
 * A delta is only ever passed when it is relative to what `getQueryResult` returned the last time
 * it was asked. An adapter that layers anything on top of its stored result — an optimistic write
 * still in flight, for instance — must omit the delta for as long as it does.
 */
export type StateChangeCallback<T extends BaseItem = BaseItem> = (
  state: 'active' | 'complete' | 'error',
  delta?: QueryDelta<T>,
) => void

/**
 * What a write changed.
 *
 * An adapter that also knows what the changed items looked like *before* the write returns the
 * object form, and the `'changed'` event on the `Collection` then carries that previous state as
 * its third argument. An adapter that does not returns the changed items on their own, exactly as
 * before, and the event omits the argument.
 *
 * The previous state is reported per item, so `previousItems[n]` is what `items[n]` was before the
 * write. An adapter that reports it must report it for every item it changed.
 * @template T - The type of the items.
 */
export interface DetailedWriteResult<T> {
  /** The changed items, as they are after the write. */
  items: T[],
  /** What each item in `items` was before the write, at the same index. */
  previousItems: T[],
}

/**
 * What a write method of a `CollectionBackend` resolves to: the changed items, or a
 * `DetailedWriteResult` that also carries their previous state. An empty list means nothing
 * matched the selector.
 * @template T - The type of the items.
 */
export type WriteResult<T> = T[] | DetailedWriteResult<T>

/**
 * The per-collection part of a `DataAdapter`. A `Collection` forwards its writes and queries to
 * it; storing, querying and persisting the items happens here.
 * @template T - The type of the items.
 * @template I - The type of the items' `id`.
 */
export interface CollectionBackend<T extends BaseItem<I>, I> {
  // CRUD operations will be proxied from the collection to the collection interface of the data layer. The CRUD logic itself will be done inside of the data layer.
  /**
   * Inserts an item that already carries its `id`.
   * @returns A promise resolving to the inserted item.
   */
  insert(item: T): Promise<T>,
  /**
   * Applies a modifier to the first item matching the selector.
   * @returns A promise resolving to what changed.
   */
  updateOne(selector: Selector<T>, modifier: Modifier<T>): Promise<WriteResult<T>>,
  /**
   * Applies a modifier to every item matching the selector.
   * @returns A promise resolving to what changed.
   */
  updateMany(selector: Selector<T>, modifier: Modifier<T>): Promise<WriteResult<T>>,
  /**
   * Replaces the first item matching the selector. The item keeps its `id` unless the
   * replacement carries one.
   * @returns A promise resolving to what changed.
   */
  replaceOne(selector: Selector<T>, replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<WriteResult<T>>,
  /**
   * Removes the first item matching the selector.
   * @returns A promise resolving to the removed items (none or one).
   */
  removeOne(selector: Selector<T>): Promise<T[]>,
  /**
   * Removes every item matching the selector.
   * @returns A promise resolving to the removed items.
   */
  removeMany(selector: Selector<T>): Promise<T[]>,

  // methods for registering and unregistering queries that will be called from the collection during find/findOne
  /**
   * Starts maintaining a live query. The collection calls it once per distinct query, when the
   * first cursor starts observing it.
   */
  registerQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void,
  /** Stops maintaining a live query, once its last observer is gone. */
  unregisterQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void,
  /**
   * Re-runs a query that is currently in the `'error'` state. Optional so
   * existing custom adapters keep compiling — an adapter that never surfaces
   * an error state has nothing to implement. `Collection` never calls it.
   */
  retryQuery?<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void,
  /** The current state of a query; an adapter that answers synchronously reports `'complete'`. */
  getQueryState<O extends QueryOptions<T>>(selector: Selector<T>, options: O): 'active' | 'complete' | 'error',
  /** The error of a query in the `'error'` state, otherwise `null`. */
  getQueryError<O extends QueryOptions<T>>(selector: Selector<T>, options: O): Error | null,
  /**
   * The current result of a query, synchronously. A query that has not been answered yet returns
   * an empty list.
   */
  getQueryResult<O extends QueryOptions<T>>(selector: Selector<T>, options: O): T[],
  /**
   * Executes a query once, without registering it; used for `{ async: true }` queries.
   * @returns A promise resolving to the result.
   */
  executeQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): Promise<T[]>,
  /**
   * Subscribes to the state changes of a query.
   * @returns A function that unsubscribes.
   */
  onQueryStateChange<O extends QueryOptions<T>>(
    selector: Selector<T>,
    options: O,
    callback: StateChangeCallback<T>,
  ): () => void,

  // lifecycle methods
  /** Releases the backend's resources; called by `Collection#dispose`. */
  dispose(): Promise<void>,
  /** Resolves once the backend is initialized, e.g. has loaded its data from storage. */
  isReady(): Promise<void>,
}

/**
 * Where a `Collection` stores and queries its items. A data adapter creates one
 * `CollectionBackend` per collection.
 */
export default interface DataAdapter {
  /**
   * Creates the backend of a collection; called from the `Collection` constructor.
   * @param collection - The collection the backend belongs to.
   * @param indices - The field names to build indices for (the collection's `indices` option).
   * @returns The collection's backend.
   */
  createCollectionBackend<
    T extends BaseItem<I>,
    I = any,
    E extends BaseItem = T,
    U = E,
  >(
    collection: Collection<T, I, E, U>,
    indices: string[],
  ): CollectionBackend<T, I>,
}
