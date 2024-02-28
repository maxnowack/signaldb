import type { BaseItem } from '../Collection'
import type { FlatSelector } from './Selector'

type IndexResult = {
  positions: number[],
  fields: string[],
  matched: true,
} | {
  positions?: never,
  fields?: never,
  matched: false,
}

interface OldIndexProvider<T extends BaseItem<I> = BaseItem, I = any> {
  /**
  * @deprecated Use `query` instead
  */
  getItemPositions(selector: FlatSelector<T>): null | number[],
  rebuild(items: T[]): void,
}

interface NewIndexProvider<T extends BaseItem<I> = BaseItem, I = any> {
  getItemPositions?: never,
  query(selector: FlatSelector<T>): IndexResult,
  rebuild(items: T[]): void,
}

type IndexProvider<T extends BaseItem<I> = BaseItem, I = any> = OldIndexProvider<T, I>
| NewIndexProvider<T, I>

export default IndexProvider
