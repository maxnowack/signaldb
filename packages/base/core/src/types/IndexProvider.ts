import type { BaseItem } from '../Collection'
import type { FlatSelector } from './Selector'

type IndexResult = {
  positions: number[],
  fields: string[],
  keepSelector?: boolean,
  matched: true,
} | {
  positions?: never,
  fields?: never,
  keepSelector?: never,
  matched: false,
}

interface IndexProvider<T extends BaseItem<I> = BaseItem, I = any> {
  query(selector: FlatSelector<T>): IndexResult,
  rebuild(items: T[]): void,
}

export type LowLevelIndexProvider<
  T extends BaseItem<I> = BaseItem,
  I = any,
> = IndexProvider<T, I> & {
  _index: Map<string, Set<number>>,
}

export default IndexProvider
