import { Query } from 'mingo'
import type Selector from '../types/Selector'

type BaseItem = Record<string, any>

export default function match<T extends BaseItem = BaseItem>(
  item: T,
  selector: Selector<T>,
) {
  const query = new Query(selector)
  return query.test(item)
}
