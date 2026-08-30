import type { BaseItem, FieldSpecifier, SortSpecifier } from './Collection'
import type Collection from './Collection'
import type Modifier from './types/Modifier'
import type Selector from './types/Selector'
import type { QueryDelta } from './utils/queryDelta'

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
 */
export interface DetailedWriteResult<T> {
  items: T[],
  previousItems: T[],
}

export type WriteResult<T> = T[] | DetailedWriteResult<T>

export interface CollectionBackend<T extends BaseItem<I>, I> {
  // CRUD operations will be proxied from the collection to the collection interface of the data layer. The CRUD logic itself will be done inside of the data layer.
  insert(item: T): Promise<T>,
  updateOne(selector: Selector<T>, modifier: Modifier<T>): Promise<WriteResult<T>>,
  updateMany(selector: Selector<T>, modifier: Modifier<T>): Promise<WriteResult<T>>,
  replaceOne(selector: Selector<T>, replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<WriteResult<T>>,
  removeOne(selector: Selector<T>): Promise<T[]>,
  removeMany(selector: Selector<T>): Promise<T[]>,

  // methods for registering and unregistering queries that will be called from the collection during find/findOne
  registerQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void,
  unregisterQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void,
  /**
   * Re-runs a query that is currently in the `'error'` state. Optional so
   * existing custom adapters keep compiling — an adapter that never surfaces
   * an error state has nothing to implement.
   */
  retryQuery?<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void,
  getQueryState<O extends QueryOptions<T>>(selector: Selector<T>, options: O): 'active' | 'complete' | 'error',
  getQueryError<O extends QueryOptions<T>>(selector: Selector<T>, options: O): Error | null,
  getQueryResult<O extends QueryOptions<T>>(selector: Selector<T>, options: O): T[],
  executeQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): Promise<T[]>,
  onQueryStateChange<O extends QueryOptions<T>>(
    selector: Selector<T>,
    options: O,
    callback: StateChangeCallback<T>,
  ): () => void,

  // lifecycle methods
  dispose(): Promise<void>,
  isReady(): Promise<void>,
}

export default interface DataAdapter {
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
