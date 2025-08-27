import type { BaseItem } from '../Collection'
import type { FlatSelector } from './Selector'

export type IndexResult = {
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

export type SynchronousQueryFunction<T extends BaseItem<I> = BaseItem, I = any> = (
  selector: FlatSelector<T>,
) => IndexResult

export type AsynchronousQueryFunction<T extends BaseItem<I> = BaseItem, I = any> = (
  selector: FlatSelector<T>,
) => Promise<IndexResult>

interface IndexProvider<T extends BaseItem<I> = BaseItem, I = any> {
  query: SynchronousQueryFunction<T, I>,
  rebuild(items: T[]): void,
}

export type LowLevelIndexProvider<
  T extends BaseItem<I> = BaseItem,
  I = any,
> = IndexProvider<T, I> & {
  _index: Map<string, Set<number>>,
}

export default IndexProvider
