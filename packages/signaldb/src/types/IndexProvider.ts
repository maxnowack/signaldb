import type { BaseItem } from '../Collection'
import type Selector from './Selector'

type IndexResult<T extends BaseItem<I> = BaseItem, I = any> = {
  positions: number[],
  optimizedSelector?: Selector<T>,
  matched: true,
} | {
  positions?: never,
  optimizedSelector?: never,
  matched: false,
}

interface OldIndexProvider<T extends BaseItem<I> = BaseItem, I = any> {
  /**
  * @deprecated Use `query` instead
  */
  getItemPositions(selector: Selector<T>): null | number[],
  rebuild(items: T[]): void,
}

interface NewIndexProvider<T extends BaseItem<I> = BaseItem, I = any> {
  getItemPositions?: never,
  query(selector: Selector<T>): IndexResult<T>,
  rebuild(items: T[]): void,
}

type IndexProvider<T extends BaseItem<I> = BaseItem, I = any> = OldIndexProvider<T, I>
| NewIndexProvider<T, I>

export default IndexProvider
