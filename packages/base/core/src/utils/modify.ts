import { update } from 'mingo'
import type { UpdateExpression } from 'mingo/updater'
import type { UpdateOptions } from 'mingo/core'
import type { AnyObject } from 'mingo/types'
import type Modifier from '../types/Modifier'

/**
 * Applies a modifier to an object and returns a new modified object.
 * @template T - The type of the object to be modified.
 * @param item - The object to be modified.
 * @param modifier - The modifier to apply. This can be any transformation logic.
 * @param arrayFilters - Filters to apply to nested items.
 * @param condition - Conditions to validate before performing update.
 * @param options - Update options to override defaults.
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
  arrayFilters: AnyObject[] = [],
  condition: AnyObject = {},
  options: UpdateOptions = {},
) {
  const clonedItem = { ...item }
  update(clonedItem, modifier as UpdateExpression, arrayFilters, condition, options)
  return clonedItem
}
