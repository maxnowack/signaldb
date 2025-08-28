import type { AsynchronousQueryFunction, IndexResult, SynchronousQueryFunction } from '../types/IndexProvider'
import type { FlatSelector } from '../types/Selector'
import type Selector from '../types/Selector'
import intersection from '../utils/intersection'
import type { BaseItem } from './types'

type IndexInfo<
  T extends BaseItem<I> = BaseItem,
  I = any,
> = {
  matched: boolean,
  positions: number[],
  optimizedSelector: FlatSelector<T>,
}

/**
 * Retrieves merged index information for a given flat selector by querying multiple
 * index providers. Combines results from all index providers to determine matched positions
 * and an optimized selector.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param queryFunctions - An array of index providers to query.
 * @param selector - The flat selector used to filter items.
 * @returns An object containing:
 *   - `matched`: A boolean indicating if the selector matched any items.
 *   - `positions`: An array of matched item positions.
 *   - `optimizedSelector`: A flat selector optimized based on the index results.
 */
export function getMergedIndexInfo<T extends BaseItem<I> = BaseItem, I = any>(
  queryFunctions: (SynchronousQueryFunction<T, I> | AsynchronousQueryFunction<T, I>)[],
  selector: FlatSelector<T>,
): IndexInfo<T, I> | Promise<IndexInfo<T, I>> {
  return queryFunctions.reduce((memoOrPromise, queryFunction) => {
    const resultOrPromise = queryFunction(selector)
    const processResult = (memo: IndexInfo<T, I>, result: IndexResult) => {
      if (!result.matched) return memo

      const optimizedSelector = result.keepSelector
        ? memo.optimizedSelector
        : Object.fromEntries(Object.entries(memo.optimizedSelector)
          .filter(([key]) => !result.fields.includes(key))) as FlatSelector<T>
      return {
        matched: true,
        positions: [...new Set(memo.matched
          ? intersection(memo.positions, result.positions)
          : result.positions)],
        optimizedSelector,
      }
    }

    if (resultOrPromise instanceof Promise) {
      return resultOrPromise.then(async (result) => {
        const memo = memoOrPromise instanceof Promise ? await memoOrPromise : memoOrPromise
        return processResult(memo, result)
      })
    }
    const memo = memoOrPromise
    if (memo instanceof Promise) throw new Error('Mixing async and sync index providers is not supported')
    return processResult(memo, resultOrPromise)
  }, {
    matched: false,
    positions: [],
    optimizedSelector: { ...selector },
  } as Promise<IndexInfo<T, I>> | IndexInfo<T, I>)
}

/**
 * Optimizes a logic gate ($and/$or) of selectors by querying multiple index providers.
 * @param queryFunctions - An array of index providers to query.
 * @param logicGate - An array of selectors representing the logic gate.
 * @param positionsCallback - A callback function called with matched positions.
 * @returns An array of optimized selectors or a promise that resolves to such an array.
 */
function optimizeLogicGate<T extends BaseItem<I> = BaseItem, I = any>(
  queryFunctions: (SynchronousQueryFunction<T> | AsynchronousQueryFunction<T>)[],
  logicGate: Selector<T>[],
  positionsCallback: (matched: boolean, positions: number[]) => void,
): Selector<T>[] | Promise<Selector<T>[]> {
  return logicGate.reduce((memoOrPromise, sel) => {
    const getSelector = (indexInfo: IndexInfo<T, I>) => {
      const {
        matched: selMatched,
        positions: selPositions,
        optimizedSelector,
      } = indexInfo
      if (selMatched) {
        positionsCallback(true, selPositions)
        if (Object.keys(optimizedSelector).length > 0) {
          return optimizedSelector
        }
      } else {
        positionsCallback(false, [])
        return sel
      }
    }
    const indexInfoOrPromise = getIndexInfo(queryFunctions, sel)
    if (indexInfoOrPromise instanceof Promise) {
      return indexInfoOrPromise.then(async (indexInfo) => {
        const memo = memoOrPromise instanceof Promise ? await memoOrPromise : memoOrPromise
        const optimizedSelector = getSelector(indexInfo)
        if (optimizedSelector) memo.push(optimizedSelector as FlatSelector<T>)
        return memo
      })
    }

    const memo = memoOrPromise
    if (memo instanceof Promise) throw new Error('Mixing async and sync index providers is not supported')

    const optimizedSelector = getSelector(indexInfoOrPromise)
    if (optimizedSelector) memo.push(optimizedSelector as FlatSelector<T>)
    return memo
  }, [] as FlatSelector<T>[] | Promise<FlatSelector<T>[]>)
}

/**
 * Retrieves index information for a given complex selector by querying multiple
 * index providers. Handles nested `$and` and `$or` conditions in the selector and
 * optimizes the selector to minimize processing overhead.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param queryFunctions - An array of index providers to query.
 * @param selector - The complex selector used to filter items.
 * @returns An object containing:
 *   - `matched`: A boolean indicating if the selector matched any items.
 *   - `positions`: An array of matched item positions.
 *   - `optimizedSelector`: A selector optimized based on the index results, with unused
 *     conditions removed.
 */
export default function getIndexInfo<
  QueryFunction extends SynchronousQueryFunction<T, I> | AsynchronousQueryFunction<T, I>,
  T extends BaseItem<I> = BaseItem,
  I = any,
>(
  queryFunctions: QueryFunction[],
  selector: Selector<T>,
): QueryFunction extends AsynchronousQueryFunction<T, I>
  ? Promise<IndexInfo<T, I>>
  : IndexInfo<T, I> {
  if (selector == null || Object.keys(selector).length <= 0) {
    return {
      matched: false,
      positions: [],
      optimizedSelector: selector,
    } as unknown as QueryFunction extends AsynchronousQueryFunction<T, I>
      ? Promise<IndexInfo<T, I>>
      : IndexInfo<T, I>
  }

  const { $and, $or, ...rest } = selector

  const flatInfoOrPromise = getMergedIndexInfo(queryFunctions, rest as FlatSelector<T>)
  const processFlatInfo = (flatInfo: IndexInfo<T, I>) => {
    let { matched, positions } = flatInfo
    const newSelector: Selector<T> = flatInfo.optimizedSelector
    const $andNewOrPromise = Array.isArray($and)
      ? optimizeLogicGate(queryFunctions, $and, (match, selPositions) => {
        if (!match) return
        positions = matched ? intersection(positions, selPositions) : selPositions
        matched = true
      })
      : undefined
    const process$and = ($andNew: Selector<T>[] | undefined) => {
      if ($andNew && $andNew.length > 0) newSelector.$and = $andNew

      let hasNonIndexField = false
      const matchedBefore = matched
      const positionsBefore = positions
      const process$or = ($orNew: Selector<T>[] | undefined) => {
        if ($orNew && $orNew.length > 0) newSelector.$or = $orNew

        if (hasNonIndexField) { // if there was a non-indexed field, we can't optimize the $or away
          newSelector.$or = $or
          matched = matchedBefore
          positions = positionsBefore
        }

        return {
          matched,
          positions: positions || [],
          optimizedSelector: newSelector,
        }
      }

      const $orNewOrPromise = Array.isArray($or)
        ? optimizeLogicGate(queryFunctions, $or, (match, selPositions) => {
          if (match) {
            positions = [...new Set([...positions, ...selPositions])]
            matched = true
          } else {
            hasNonIndexField = true
          }
        })
        : undefined
      if ($orNewOrPromise instanceof Promise) {
        return $orNewOrPromise.then($orNew => process$or($orNew))
      }
      return process$or($orNewOrPromise)
    }
    if ($andNewOrPromise instanceof Promise) {
      return $andNewOrPromise.then($andNew => process$and($andNew))
    }
    return process$and($andNewOrPromise)
  }
  if (flatInfoOrPromise instanceof Promise) {
    return flatInfoOrPromise
      .then(processFlatInfo) as unknown as QueryFunction extends AsynchronousQueryFunction<T, I>
      ? Promise<IndexInfo<T, I>>
      : IndexInfo<T, I>
  }
  return processFlatInfo(
    flatInfoOrPromise,
  ) as unknown as QueryFunction extends AsynchronousQueryFunction<T, I>
    ? Promise<IndexInfo<T, I>>
    : IndexInfo<T, I>
}
