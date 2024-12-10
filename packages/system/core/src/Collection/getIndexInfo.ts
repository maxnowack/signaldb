import type IndexProvider from '../types/IndexProvider'
import type { FlatSelector } from '../types/Selector'
import type Selector from '../types/Selector'
import intersection from '../utils/intersection'
import type { BaseItem } from './types'

export function getMergedIndexInfo<T extends BaseItem<I> = BaseItem, I = any>(
  indexProviders: IndexProvider<T, I>[],
  selector: FlatSelector<T>,
) {
  return indexProviders.reduce<{
    matched: boolean,
    positions: number[],
    optimizedSelector: FlatSelector<T>,
  }>((memo, indexProvider) => {
    /* istanbul ignore if -- @preserve */ // ignored because it's deprecated
    if (indexProvider.getItemPositions) {
      const result = indexProvider.getItemPositions(selector)
      if (result == null) return memo
      return {
        matched: true,
        positions: memo.matched
          ? intersection(memo.positions, result)
          : result,
        optimizedSelector: memo.optimizedSelector,
      }
    }

    const info = indexProvider.query(selector)
    if (!info.matched) return memo

    const optimizedSelector = Object.fromEntries(Object.entries(memo.optimizedSelector)
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
      }
    }
    if ($orNew.length > 0) newSelector.$or = $orNew
  }

  return {
    matched,
    positions: positions || [],
    optimizedSelector: newSelector,
  }
}
