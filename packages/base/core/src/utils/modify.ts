import { update } from 'mingo'
import type Modifier from '../types/Modifier'

/**
 * Applies a modifier to an object and returns a new modified object.
 * @template T - The type of the object to be modified.
 * @param item - The object to be modified.
 * @param modifier - The modifier to apply. This can be any transformation logic.
 * @returns - Returns a new object with the modifications applied.
 * @example
 * const item = { a: 1, b: 2 }
 * const modifier = { $set: { b: 3, c: 4 } }
 * const result = modify(item, modifier)
 * // result: { a: 1, b: 3, c: 4 }
 */
export default function modify<T extends Record<string, any>>(
  item: T,
  modifier: Modifier,
) {
  const hasOperators = Object.keys(modifier).some(key => key.startsWith('$'))
  if (!hasOperators) return modifier as T

  const clonedItem = { ...item }
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  update(clonedItem, modifier as any)
  return clonedItem
}
