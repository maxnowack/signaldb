import type { BaseItem } from '../Collection'
import type Selector from '../types/Selector'
import type { FlatSelector } from '../types/Selector'
import type StorageAdapter from '../types/StorageAdapter'
import type { StorageQuery, StorageQueryAnswer } from '../types/StorageAdapter'
import getIndexInfo from '../getIndexInfo'
import compact from './compact'
import idIndexQuery from './idIndexQuery'
import isEqual from './isEqual'
import match from './match'
import projectItems from './projectItems'
import sortItems from './sortItems'
import storageIndexQuery from './storageIndexQuery'

/**
 * Runs one query against a storage adapter and returns its finished result.
 *
 * This is the single place a query becomes rows. It used to be three
 * copies — `AsyncDataAdapter`, `AutoFetchDataAdapter` and
 * `WorkerDataAdapterHost` each had the same eight lines — which is exactly how
 * a capability like `StorageAdapter#query` ends up supported in one of them
 * and quietly missing from the other two.
 *
 * Two paths, and the second is what every adapter had before:
 *
 * - the adapter answers `query` itself, and this applies whatever it declined;
 * - it does not, and this reads through the index (or the whole store) and
 *   filters, sorts, windows and projects here.
 */
export default async function executeStorageQuery<T extends BaseItem<I>, I = any>(
  storageAdapter: StorageAdapter<any, any>,
  indices: string[],
  selector: Selector<T> | null,
  options?: StorageQuery<T> extends never ? never : {
    sort?: StorageQuery<T>['sort'],
    skip?: StorageQuery<T>['skip'],
    limit?: StorageQuery<T>['limit'],
    fields?: StorageQuery<T>['fields'],
  },
): Promise<T[]> {
  // A null selector matches nothing, and is not worth asking a store about.
  if (selector === null) return []
  const effectiveSelector = selector || {}
  const { sort, skip, limit, fields } = options || {}

  if (storageAdapter.query) {
    const answer = await storageAdapter.query({ selector: effectiveSelector, sort, skip, limit, fields }) as StorageQueryAnswer<T>
    return finishAnswer(answer, { sort, skip, limit, fields })
  }

  const items = await readMatching<T, I>(storageAdapter, indices, effectiveSelector)
  return finishAnswer({ items }, { sort, skip, limit, fields })
}

function finishAnswer<T extends BaseItem>(
  answer: StorageQueryAnswer<T>,
  options: { sort?: StorageQuery<T>['sort'], skip?: number, limit?: number, fields?: StorageQuery<T>['fields'] },
): T[] {
  const { sort, skip, limit, fields } = options
  const residual = answer.residualSelector
  const hasResidual = residual != null && Object.keys(residual).length > 0

  // The three contradictions `StorageQueryAnswer` names. An adapter claiming
  // one of them has produced a result nothing downstream can repair, so this
  // fails loudly here rather than serving a subset that looks like an answer.
  if (answer.windowed) {
    if (hasResidual) {
      throw new Error('StorageAdapter#query claimed `windowed` while leaving part of the selector unapplied; the window is over the wrong set')
    }
    if (sort != null && !answer.sorted) {
      throw new Error('StorageAdapter#query claimed `windowed` without `sorted` for a sorted query; the window is an arbitrary subset')
    }
  }
  if (answer.projected && sort != null && !answer.sorted && !sortKeysSurviveProjection(sort, fields)) {
    throw new Error('StorageAdapter#query claimed `projected` without `sorted`, and the projection drops a key the sort needs')
  }

  const matched = hasResidual
    ? answer.items.filter(item => match(item, residual as Selector<T>))
    : answer.items
  const sorted = sort && !answer.sorted ? sortItems(matched, sort) : matched
  const windowed = answer.windowed
    ? sorted
    : (limit != null ? (skip ? sorted.slice(skip) : sorted).slice(0, limit) : (skip ? sorted.slice(skip) : sorted))
  return answer.projected ? windowed : projectItems(windowed, fields)
}

/** Whether every key the sort is on survives the projection. */
function sortKeysSurviveProjection<T extends BaseItem>(
  sort: NonNullable<StorageQuery<T>['sort']>,
  fields: StorageQuery<T>['fields'],
): boolean {
  if (fields == null) return true
  const keys = Object.keys(sort)
  const specKeys = Object.keys(fields)
  const excluding = specKeys.length > 0 && specKeys.every(key => !(fields as Record<string, unknown>)[key])
  return keys.every((key) => {
    if (excluding) return !specKeys.some(spec => spec === key || key.startsWith(`${spec}.`))
    return specKeys.some(spec => spec === key || key.startsWith(`${spec}.`))
  })
}

/**
 * The pre-`query` read path: the primary key if the selector is one, then a
 * declared index, then the whole store.
 *
 * The `id` fast path is not an optimisation on top of the index machinery, it
 * is the only way a primary-key lookup works at all: `id` is never a *declared*
 * index — `readIds` is exactly the lookup it describes — so a selector of
 * `{ id: … }` matches no index and would otherwise fall through to `readAll`.
 * All three adapters carried their own copy of it; losing it here turned every
 * point read into a full scan, which is how it was noticed.
 */
async function readMatching<T extends BaseItem<I>, I = any>(
  storageAdapter: StorageAdapter<any, any>,
  indices: string[],
  selector: Selector<T>,
): Promise<T[]> {
  if (Object.keys(selector).length === 1 && 'id' in selector) {
    const idResult = idIndexQuery<T, I>(selector as FlatSelector<T>)
    // `compact`, as two of the three copies did: an id that is not a value is
    // not a row to look up, and passing it on only asks the store a question
    // it cannot answer.
    if (idResult.matched) return await storageAdapter.readIds(compact(idResult.ids)) as T[]
  }

  const indexInfo = await getIndexInfo<any, T, I>(
    indices.map(field => storageIndexQuery<T, I>(storageAdapter, field)),
    selector,
  )
  const matchItems = (item: T) => {
    if (indexInfo.optimizedSelector == null) return true
    if (Object.keys(indexInfo.optimizedSelector).length <= 0) return true
    return match(item, indexInfo.optimizedSelector)
  }
  if (indexInfo.matched) {
    const items = await storageAdapter.readIds(indexInfo.ids) as T[]
    if (isEqual(indexInfo.optimizedSelector, {})) return items
    return items.filter(matchItems)
  }
  const allItems = await storageAdapter.readAll() as T[]
  if (isEqual(selector, {})) return allItems
  return allItems.filter(matchItems)
}
