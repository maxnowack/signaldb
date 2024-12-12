import { sort } from 'fast-sort'
import get from './get'

/**
 * Sorts an array of items based on multiple fields and their specified sort order.
 * Uses the `fast-sort` library for efficient sorting.
 * @template T - The type of the items in the array.
 * @param items - The array of items to be sorted.
 * @param sortFields - An object defining the sort order for each field.
 *   - Keys are the field names, and values are either `1` (ascending) or `-1` (descending).
 * @returns A new array of items sorted based on the specified fields and their order.
 */
export default function sortItems<T extends Record<string, any>>(
  items: T[],
  sortFields: { [P in keyof T]?: -1 | 1 } & Record<string, -1 | 1>,
) {
  return sort(items).by(Object.entries(sortFields).map(([key, value]) => {
    const order = value === 1 ? 'asc' : 'desc'
    return { [order]: (i: T) => get(i, key) } as Record<'asc' | 'desc', (i: T) => any>
  }))
}
