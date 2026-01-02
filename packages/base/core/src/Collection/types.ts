import type ReactivityAdapter from '../types/ReactivityAdapter'

export type BaseItem<I = any> = { id: I } & Record<string, any>

export type Transform<T, U = T> = ((document: T) => U) | null | undefined

export type TransformAll<T extends BaseItem, O extends BaseItem = T> = (
    (items: T[], fields: FieldSpecifier<O> | undefined) => O[]
) | null | undefined

export type SortSpecifier<T> = { [P in keyof T]?: -1 | 1 } & Record<string, -1 | 1>

export type FieldSpecifier<T> = { [P in keyof T]?: 0 | 1 } & Record<string, 0 | 1>

export interface FindOptions<T extends BaseItem> {
  /** Sort order (default: natural order) */
  sort?: SortSpecifier<T> | undefined,
  /** Number of results to skip at the beginning */
  skip?: number | undefined,
  /** Maximum number of results to return */
  limit?: number | undefined,
  /** Dictionary of fields to return or exclude. */
  fields?: FieldSpecifier<T> | undefined,
  /** pass `false` to disable reactivity */
  reactive?: ReactivityAdapter | false,
  /** pass `true` to enable automatic field-level reactitivy */
  fieldTracking?: boolean,
}
