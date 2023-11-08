import type { BaseItem } from '../Collection'
import type Selector from './Selector'

export default interface IndexProvider<T extends BaseItem<I> = BaseItem, I = any> {
  getItemPositions(selector: Selector<T>): null | number[],
  rebuild(items: T[]): void,
}
