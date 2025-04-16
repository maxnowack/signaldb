import type { CursorOptions } from '../Collection'
import { clone } from './deepClone.ts'

/**
 * Enrich a collection based on a specified fields configuration.
 * @template T - The type of the items in the collection.
 * @param items - The collection to enrich.
 * @param options - Optional configuration for the cursor.
 * @param options.fields - An object defining the fields to include (`1`) or exclude (`0`).
 *   - Keys are the field names, and values are either `1` (include) or `0` (exclude).
 * @param options.enrichCollection - A function that will be able to solve the n+1 problem
 * @returns A new collection with the specified fields included.
 */
export default function enrich<T extends Record<string, any>>(
  items: T[],
  options: CursorOptions<T>,
) {
  if (!options.enrichCollection || !options.fields) {
    return items
  }

  const result = clone(items)
  options.enrichCollection(result, options.fields)
  return result
}
