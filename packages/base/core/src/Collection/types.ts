import type { QueryOptions } from '../DataAdapter'
import type ReactivityAdapter from '../types/ReactivityAdapter'

export type BaseItem<I = any> = { id: I } & Record<string, any>

export type Transform<T, U = T> = ((document: T) => U) | null | undefined

export type SortSpecifier<T> = { [P in keyof T]?: -1 | 1 } & Record<string, -1 | 1>

export type FieldSpecifier<T> = { [P in keyof T]?: 0 | 1 } & Record<string, 0 | 1>

export interface FindOptions<T extends BaseItem, Async extends boolean> extends QueryOptions<T> {
  /** pass `false` to disable reactivity */
  reactive?: ReactivityAdapter | false,
  /** pass `true` to enable automatic field-level reactitivy */
  fieldTracking?: boolean,
  /** pass `true` to execute the query asynchronously */
  async?: Async,
}
