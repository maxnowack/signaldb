import type { QueryOptions } from '../DataAdapter'
import type Selector from '../types/Selector'
import type { BaseItem } from '../Collection/types'
import match from './match'
import sortItems from './sortItems'
import projectItems from './projectItems'

/**
 * Filters, sorts, paginates and projects a plain in-memory array the same way
 * DefaultDataAdapter and WorkerDataAdapterHost apply a selector/QueryOptions
 * pair to their stored items. Used to re-derive a query's result locally after
 * a write, without asking the backing store again.
 * @template T - The type of the items.
 * @param items - The items to filter, sort, paginate and project.
 * @param selector - The selector to match items against.
 * @param options - Sort, skip, limit and field projection options.
 * @returns The resulting items.
 */
export default function applyQueryOptions<T extends BaseItem>(
  items: T[],
  selector: Selector<T>,
  options?: QueryOptions<T>,
): T[] {
  const matched = selector == null ? [] : items.filter(item => match(item, selector))
  const { sort, skip, limit, fields } = options || {}
  const sorted = sort ? sortItems(matched, sort) : matched
  const skipped = skip ? sorted.slice(skip) : sorted
  const limited = limit ? skipped.slice(0, limit) : skipped
  return projectItems(limited, fields)
}
