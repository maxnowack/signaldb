import type IndexProvider from '../types/IndexProvider'
import type { FlatSelector } from '../types/Selector'
import type Selector from '../types/Selector'
import intersection from '../utils/intersection'
import type { BaseItem } from './types'

/**
 * Retrieves merged index information for a given flat selector by querying multiple
 * index providers. Combines results from all index providers to determine matched positions
 * and an optimized selector.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param indexProviders - An array of index providers to query.
 * @param selector - The flat selector used to filter items.
 * @returns An object containing:
 *   - `matched`: A boolean indicating if the selector matched any items.
 *   - `positions`: An array of matched item positions.
 *   - `optimizedSelector`: A flat selector optimized based on the index results.
 */
export function getMergedIndexInfo<T extends BaseItem<I> = BaseItem, I = any>(
  indexProviders: IndexProvider<T, I>[],
  selector: FlatSelector<T>,
) {
  return indexProviders.reduce<{
    matched: boolean,
    positions: number[],
    optimizedSelector: FlatSelector<T>,
  }>((memo, indexProvider) => {
    const info = indexProvider.query(selector)
    if (!info.matched) return memo

    const optimizedSelector = info.keepSelector
      ? memo.optimizedSelector
      : Object.fromEntries(Object.entries(memo.optimizedSelector)
        .filter(([key]) => !info.fields.includes(key))) as FlatSelector<T>

    return {
      matched: true,
      positions: [...new Set(memo.matched
        ? intersection(memo.positions, info.positions)
        : info.positions)],
      optimizedSelector,
    }
  }, {
    matched: false,
    positions: [],
    optimizedSelector: { ...selector },
  })
}

/**
 * Retrieves index information for a given complex selector by querying multiple
 * index providers. Handles nested `$and` and `$or` conditions in the selector and
 * optimizes the selector to minimize processing overhead.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param indexProviders - An array of index providers to query.
 * @param selector - The complex selector used to filter items.
 * @returns An object containing:
 *   - `matched`: A boolean indicating if the selector matched any items.
 *   - `positions`: An array of matched item positions.
 *   - `optimizedSelector`: A selector optimized based on the index results, with unused
 *     conditions removed.
 */
export default function getIndexInfo<T extends BaseItem<I> = BaseItem, I = any>(
  indexProviders: IndexProvider<T, I>[],
  selector: Selector<T>,
) {
  if (selector == null || Object.keys(selector).length <= 0) {
    return { matched: false, positions: [], optimizedSelector: selector }
  }

  const { $and, $or, ...rest } = selector

  const flatInfo = getMergedIndexInfo(indexProviders, rest as FlatSelector<T>)
  let { matched, positions } = flatInfo
  const newSelector: Selector<T> = flatInfo.optimizedSelector
  if (Array.isArray($and)) {
    const $andNew = []
    for (const sel of $and) {
      const {
        matched: selMatched,
        positions: selPositions,
        optimizedSelector,
      } = getIndexInfo(indexProviders, sel)
      if (selMatched) {
        positions = matched ? intersection(positions, selPositions) : selPositions
        matched = true
        if (Object.keys(optimizedSelector).length > 0) {
          $andNew.push(optimizedSelector)
        }
      } else {
        $andNew.push(sel)
      }
    }
    if ($andNew.length > 0) newSelector.$and = $andNew
  }
  if (Array.isArray($or)) {
    const $orNew = []
    const matchedBefore = matched
    const positionsBefore = positions
    let hasNonIndexField = false
    for (const sel of $or) {
      const {
        matched: selMatched,
        positions: selPositions,
        optimizedSelector,
      } = getIndexInfo(indexProviders, sel)
      if (selMatched) {
        positions = [...new Set([...positions, ...selPositions])]
        matched = true
        if (Object.keys(optimizedSelector).length > 0) {
          $orNew.push(optimizedSelector)
        }
      } else {
        $orNew.push(sel)
        hasNonIndexField = true
      }
    }
    if ($orNew.length > 0) newSelector.$or = $orNew

    if (hasNonIndexField) { // if there was a non-indexed field, we can't optimize the $or away
      newSelector.$or = $or
      matched = matchedBefore
      positions = positionsBefore
    }
  }

  return {
    matched,
    positions: positions || [],
    optimizedSelector: newSelector,
  }
}
