import type { QueryOptions } from '../DataAdapter'
import type { BaseItem } from '../Collection/types'
import project from './project'

/**
 * Applies a query's field projection to a list of items, keeping the primary key unless the
 * projection excludes it outright. Returns the items untouched when there is no projection, so a
 * caller does not have to check for one first.
 * @template T - The type of the items.
 * @param items - The items to project.
 * @param fields - The projection, or `undefined` for none.
 * @returns The projected items.
 */
export default function projectItems<T extends BaseItem>(
  items: T[],
  fields: QueryOptions<T>['fields'],
): T[] {
  if (!fields) return items
  const idExcluded = fields.id === 0
  return items.map(item => ({
    ...idExcluded ? {} : { id: item.id },
    ...project(item, fields),
  }))
}
