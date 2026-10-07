import { update } from 'mingo'
import type Modifier from '../types/Modifier'
import deepClone from './deepClone'

/**
 * Applies a modifier to an object and returns a new modified object; the original is left
 * untouched. Update operators (`$set`, `$inc`, …) are applied with mingo. A modifier without any
 * operator is a replacement and is returned as the result itself.
 * @template T - The type of the object to be modified.
 * @param item - The object to be modified.
 * @param modifier - The modifier to apply.
 * @returns A new object with the modifications applied, or the modifier itself if it contains no
 * operator.
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

  const clonedItem = deepClone(item)
  // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
  update(clonedItem, modifier as any)
  return clonedItem
}
