import type { QueryOptions } from '../DataAdapter'
import type ReactivityAdapter from '../types/ReactivityAdapter'

/**
 * The minimal shape of an item stored in a collection: an object with an `id`.
 * @template I - The type of the `id`.
 */
export type BaseItem<I = any> = { id: I } & Record<string, any>

/**
 * A function applied to every item a cursor returns, or `null`/`undefined` for none.
 * @template T - The type of the item before the transform.
 * @template U - The type of the item after the transform.
 */
export type Transform<T, U = T> = ((document: T) => U) | null | undefined

/**
 * A function applied to a query's whole result, together with the query's `fields` option, or
 * `null`/`undefined` for none.
 * @template T - The type of the items before the transform.
 * @template O - The type of the items after the transform.
 */
export type TransformAll<T extends BaseItem, O extends BaseItem = T> = (
    (items: T[], fields: FieldSpecifier<O> | undefined) => O[]
) | null | undefined

/**
 * Maps field names (dot notation allowed) to `1` for ascending or `-1` for descending order.
 * @template T - The type of the items being sorted.
 */
export type SortSpecifier<T> = { [P in keyof T]?: -1 | 1 } & Record<string, -1 | 1>

/**
 * A projection: maps field names (dot notation allowed) to `1` to include or `0` to exclude them.
 * @template T - The type of the items being projected.
 */
export type FieldSpecifier<T> = { [P in keyof T]?: 0 | 1 } & Record<string, 0 | 1>

/**
 * Options of `Collection#find` and `Collection#findOne`: the `QueryOptions` plus how the query is
 * read.
 * @template T - The type of the items queried.
 * @template Async - Whether the query is executed asynchronously.
 */
export interface FindOptions<T extends BaseItem, Async extends boolean> extends QueryOptions<T> {
  /**
   * The reactivity adapter for this query (default: the collection's), or `false` to disable
   * reactivity.
   */
  reactive?: ReactivityAdapter | false,
  /**
   * `true` to enable automatic field-level reactivity (default: the collection's setting).
   */
  fieldTracking?: boolean,
  /**
   * `true` to execute the query asynchronously: the cursor's reading methods return promises and
   * register no reactive dependency.
   */
  async?: Async,
}

/**
 * `FindOptions` of an asynchronous query (`async: true`).
 * @template T - The type of the items queried.
 */
export type AsyncFindOptions<T extends BaseItem>
  = Omit<FindOptions<T, true>, 'async'> & { async: true }

/**
 * `FindOptions` of a synchronous query (`async` omitted or `false`).
 * @template T - The type of the items queried.
 */
export type SyncFindOptions<T extends BaseItem>
  = Omit<FindOptions<T, false>, 'async'> & { async?: false }

/**
 * Either `AsyncFindOptions` or `SyncFindOptions`.
 * @template T - The type of the items queried.
 */
export type AnyFindOptions<T extends BaseItem>
  = | AsyncFindOptions<T>
    | SyncFindOptions<T>
