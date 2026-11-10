import { Query } from 'mingo'
import type Selector from '../types/Selector'

type BaseItem = Record<string, any>

/**
 * Compiles a selector once into a predicate that tests items against it.
 * Compiling is what a mingo `Query` spends nearly all of its time on — measured in a consuming
 * app, building the query cost about fifteen times what testing an item against it did — so a
 * loop over items compiles its selector once, ahead of the loop, rather than once per item.
 * @template T - The type of the items being tested.
 * @param selector - The query selector to compile.
 * @returns A function telling whether an item matches the selector.
 */
export function createMatcher<T extends BaseItem = BaseItem>(
  selector: Selector<T>,
): (item: T) => boolean {
  const query = new Query(selector)
  return item => query.test(item)
}

/**
 * Tests whether a given item matches a specified selector.
 * Uses the `mingo` library to evaluate the query. Compiles the selector on every call; to test
 * more than one item, compile it once with `createMatcher`.
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
