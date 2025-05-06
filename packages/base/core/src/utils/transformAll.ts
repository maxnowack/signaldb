import type { BaseItem, CursorOptions } from '../Collection'
import { clone } from './deepClone.ts'

/**
 * Transform a collection based on a specified fields configuration.
 * @template T - The type of the items in the collection.
 * @param items - The collection to transform.
 * @param options - Optional configuration for the cursor.
 * @param options.fields - An object defining the fields to include (`1`) or exclude (`0`).
 *   - Keys are the field names, and values are either `1` (include) or `0` (exclude).
 * @param options.transformAll - A function that will be able to solve the n+1 problem
 * @returns A new collection with the specified fields included.
 */
export default function transformAll<T extends BaseItem, U = T>(
  items: T[],
  options: CursorOptions<T, U>,
) {
  if (!options.transformAll || !options.fields) {
    return items
  }

  const result = clone(items)
  options.transformAll(result, options.fields)
  return result
}
