import type { BaseItem, FieldSpecifier, SortSpecifier } from './Collection'
import type Collection from './Collection'
import type Modifier from './types/Modifier'
import type Selector from './types/Selector'

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

export interface CollectionBackend<T extends BaseItem<I>, I> {
  // CRUD operations will be proxied from the collection to the collection interface of the data layer. The CRUD logic itself will be done inside of the data layer.
  insert(item: T): Promise<T>,
  updateOne(selector: Selector<T>, modifier: Modifier<T>): Promise<T[]>,
  updateMany(selector: Selector<T>, modifier: Modifier<T>): Promise<T[]>,
  replaceOne(selector: Selector<T>, replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<T[]>,
  removeOne(selector: Selector<T>): Promise<T[]>,
  removeMany(selector: Selector<T>): Promise<T[]>,

  // methods for registering and unregistering queries that will be called from the collection during find/findOne
  registerQuery<O extends QueryOptions<T>>(selector: Selector<T>, options?: O): void,
  unregisterQuery<O extends QueryOptions<T>>(selector: Selector<T>, options?: O): void,
  getQueryState<O extends QueryOptions<T>>(selector: Selector<T>, options?: O): 'active' | 'complete' | 'error',
  getQueryError<O extends QueryOptions<T>>(selector: Selector<T>, options?: O): Error | null,
  getQueryResult<O extends QueryOptions<T>>(selector: Selector<T>, options?: O): T[],
  executeQuery<O extends QueryOptions<T>>(selector: Selector<T>, options?: O): Promise<T[]>,
  onQueryStateChange<O extends QueryOptions<T>>(
    selector: Selector<T>,
    options: O | undefined,
    callback: (state: 'active' | 'complete' | 'error') => void,
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
