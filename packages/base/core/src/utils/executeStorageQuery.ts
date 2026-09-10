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

type QueryShape<T extends BaseItem> = Omit<StorageQuery<T>, 'selector'>

/**
 * Runs one query against a storage adapter and returns its finished result.
 *
 * This is the single place a query becomes rows. It used to be three copies — `AsyncDataAdapter`,
 * `AutoFetchDataAdapter` and `WorkerDataAdapterHost` each had the same eight lines — which is how a
 * capability like `StorageAdapter#query` ends up supported in one of them and quietly missing from
 * the other two. The copies had already drifted apart in one respect: each maintained its own
 * primary-key fast path.
 *
 * Two paths, and the second is what every adapter had before:
 *
 * - the adapter answers `query` itself, and this applies whatever it declined;
 * - it does not, and this reads through the index (or the whole store) and filters, sorts, windows
 *   and projects here.
 * @template T - The type of the items.
 * @template I - The type of the item ids.
 * @param storageAdapter - The storage adapter to read from.
 * @param indices - The fields this collection has declared indices for.
 * @param selector - The query's selector. `null` matches nothing.
 * @param options - The query's sort, window and projection.
 * @returns The query's result.
 */
export default async function executeStorageQuery<T extends BaseItem<I>, I = any>(
  storageAdapter: StorageAdapter<any, any>,
  indices: string[],
  selector: Selector<T> | null,
  options?: QueryShape<T>,
): Promise<T[]> {
  // A null selector matches nothing, and is not worth asking a store about.
  if (selector === null) return []
  const effectiveSelector = selector || {}

  if (storageAdapter.query) {
    const answer = await storageAdapter.query({
      selector: effectiveSelector,
      ...options,
    }) as StorageQueryAnswer<T>
    return finishAnswer(answer, options)
  }

  const items = await readMatching<T, I>(storageAdapter, indices, effectiveSelector)
  return finishAnswer({ items }, options)
}

/**
 * Applies whatever the adapter did not, and refuses what it cannot have meant.
 * @template T - The type of the items.
 * @param answer - What the adapter answered, and how much of the question it took on.
 * @param options - The query's sort, window and projection.
 * @returns The finished result.
 */
function finishAnswer<T extends BaseItem>(
  answer: StorageQueryAnswer<T>,
  options: QueryShape<T> | undefined,
): T[] {
  const { sort, skip, limit, fields } = options || {}
  const residual = answer.residualSelector
  const hasResidual = residual != null && Object.keys(residual).length > 0

  assertAnswerIsCoherent(answer, hasResidual, sort, fields)

  const matched = hasResidual
    ? answer.items.filter(item => match(item, residual))
    : answer.items
  const sorted = sort && !answer.sorted ? sortItems(matched, sort) : matched
  const windowed = answer.windowed ? sorted : applyWindow(sorted, skip, limit)
  return answer.projected ? windowed : projectItems(windowed, fields)
}

/**
 * Fails on the three claims that are contradictions rather than choices.
 *
 * Each of them produces a result nothing downstream can repair, so this throws where the mistake
 * is rather than serving a subset that looks like an answer.
 * @template T - The type of the items.
 * @param answer - What the adapter answered.
 * @param hasResidual - Whether part of the selector was left to the caller.
 * @param sort - The sort the query asked for, if any.
 * @param fields - The projection the query asked for, if any.
 */
function assertAnswerIsCoherent<T extends BaseItem>(
  answer: StorageQueryAnswer<T>,
  hasResidual: boolean,
  sort: QueryShape<T>['sort'],
  fields: QueryShape<T>['fields'],
): void {
  if (answer.windowed && hasResidual) {
    throw new Error('StorageAdapter#query claimed `windowed` while leaving part of the '
      + 'selector unapplied; the window is over the wrong set')
  }
  if (answer.windowed && sort != null && !answer.sorted) {
    throw new Error('StorageAdapter#query claimed `windowed` without `sorted` for a sorted '
      + 'query; the window is an arbitrary subset')
  }
  const sortIsStillOwed = sort != null && !answer.sorted
  if (answer.projected && sortIsStillOwed && !sortKeysSurviveProjection(sort, fields)) {
    throw new Error('StorageAdapter#query claimed `projected` without `sorted`, and the '
      + 'projection drops a key the sort needs')
  }
}

/**
 * Applies `skip` and `limit`.
 * @template T - The type of the items.
 * @param items - The items to window.
 * @param skip - How many to drop from the front.
 * @param limit - How many to keep.
 * @returns The windowed items.
 */
function applyWindow<T extends BaseItem>(items: T[], skip?: number, limit?: number): T[] {
  const skipped = skip ? items.slice(skip) : items
  return limit == null ? skipped : skipped.slice(0, limit)
}

/**
 * Whether every key the sort is on survives the projection.
 * @template T - The type of the items.
 * @param sort - The query's sort.
 * @param fields - The query's projection, if any.
 * @returns `true` when the sort can still be applied to the projected items.
 */
function sortKeysSurviveProjection<T extends BaseItem>(
  sort: NonNullable<QueryShape<T>['sort']>,
  fields: QueryShape<T>['fields'],
): boolean {
  if (fields == null) return true
  const specKeys = Object.keys(fields)
  const spec = fields as Record<string, unknown>
  const excluding = specKeys.length > 0 && specKeys.every(key => !spec[key])
  const covers = (key: string) => specKeys.some(entry => entry === key || key.startsWith(`${entry}.`))
  return Object.keys(sort).every(key => (excluding ? !covers(key) : covers(key)))
}

/**
 * The pre-`query` read path: the primary key if the selector is one, then a declared index, then
 * the whole store.
 *
 * The `id` fast path is not an optimisation on top of the index machinery, it is the only way a
 * primary-key lookup works at all: `id` is never a *declared* index — `readIds` is exactly the
 * lookup it describes — so a selector of `{ id: … }` matches no index and would otherwise fall
 * through to `readAll`. All three adapters carried their own copy of it; losing it here turned
 * every point read into a full scan, which is how it was noticed.
 * @template T - The type of the items.
 * @template I - The type of the item ids.
 * @param storageAdapter - The storage adapter to read from.
 * @param indices - The fields this collection has declared indices for.
 * @param selector - The query's selector.
 * @returns Every stored item the selector matches.
 */
async function readMatching<T extends BaseItem<I>, I = any>(
  storageAdapter: StorageAdapter<any, any>,
  indices: string[],
  selector: Selector<T>,
): Promise<T[]> {
  if (Object.keys(selector).length === 1 && 'id' in selector) {
    const idResult = idIndexQuery<T, I>(selector as FlatSelector<T>)
    // `compact`, as two of the three copies did: an id that is not a value is not a row to look
    // up, and passing it on only asks the store a question it cannot answer.
    if (idResult.matched) return storageAdapter.readIds(compact(idResult.ids)) as Promise<T[]>
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
