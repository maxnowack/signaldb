import { Query } from 'mingo'
import type Selector from '../types/Selector'

type BaseItem = Record<string, any>

/**
 * Tests whether a given item matches a specified selector.
 * Uses the `mingo` library to evaluate the query.
 * @template T - The type of the item being tested.
 * @param item - The item to test against the selector.
 * @param selector - The query selector used to match the item.
 * @returns A boolean indicating whether the item matches the selector.
 */
export default function match<T extends BaseItem = BaseItem>(
  item: T,
  selector: Selector<T>,
) {
  const query = new Query(selector)
  return query.test(item)
}
