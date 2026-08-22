import type { BaseItem } from '../Collection/types'
import isEqual from './isEqual'

/**
 * The change between two consecutive results of the same query, expressed so it can be applied to
 * the earlier result to obtain the later one.
 *
 * Indices in `added` and `moved` are positions in the *resulting* array and are always ascending,
 * which is what makes applying them a matter of splicing in order. Removals and moves name items by
 * id only: whoever applies the delta still holds the previous result and can look the item up
 * there, so there is no reason to send it twice — the point of the whole exercise is that a change
 * costs the size of the change, not the size of the result.
 */
export interface QueryDelta<T extends BaseItem = BaseItem> {
  /** Items that were not in the previous result, at their position in the new one. */
  added: { index: number, item: T }[],
  /** Items that were in the previous result and whose contents changed. */
  changed: T[],
  /** Ids of items that are no longer in the result. */
  removed: any[],
  /** Items that stayed, at their new position, because the order around them changed. */
  moved: { index: number, id: any }[],
  /** Length of the resulting array — lets a recipient verify it applied the delta to the result it was computed against. */
  resultCount: number,
}

/**
 * Checks whether a delta leaves the result it is applied to unchanged.
 * @param delta - The delta to inspect.
 * @returns `true` when applying the delta would be a no-op.
 */
export function isEmptyQueryDelta(delta: QueryDelta<any>) {
  return delta.added.length === 0
    && delta.changed.length === 0
    && delta.removed.length === 0
    && delta.moved.length === 0
}

/**
 * Calls a state-change callback, passing the delta only when there is one.
 *
 * A callback invoked as `callback(state, undefined)` has been handed two arguments, which is a
 * different thing from being handed one — visible to anything that inspects arity, and to any test
 * that asserts on the call.
 * @template T - The type of the items.
 * @param callback - The callback to invoke.
 * @param state - The state to report.
 * @param delta - The delta to report, if there is one.
 */
export function callWithDelta<T extends BaseItem>(
  callback: (state: 'active' | 'complete' | 'error', delta?: QueryDelta<T>) => void,
  state: 'active' | 'complete' | 'error',
  delta?: QueryDelta<T>,
) {
  if (delta == null) {
    callback(state)
    return
  }
  callback(state, delta)
}

/**
 * Checks whether a delta describes a change to the given result.
 *
 * A delta is only meaningful against the exact result it was computed from — it names positions in
 * an array and items by id alone. Applying one to anything else produces a result that looks
 * plausible and is wrong, and from then on every further delta compounds the error. This is the
 * cheap structural check that catches that: every id the delta expects to find is there, every id
 * it expects to be new is not, and the arithmetic on the length works out. It costs the size of the
 * delta, not the size of the result.
 * @template T - The type of the items.
 * @param previous - The result the delta would be applied to.
 * @param delta - The delta to check.
 * @returns `true` when the delta can be applied.
 */
export function canApplyQueryDelta<T extends BaseItem>(
  previous: T[],
  delta: QueryDelta<T>,
): boolean {
  const present = new Set(previous.map(item => item.id))
  const seen = new Set<any>()
  const claim = (id: any, shouldExist: boolean) => {
    if (seen.has(id)) return false
    seen.add(id)
    return present.has(id) === shouldExist
  }

  const expectedCount = previous.length - delta.removed.length + delta.added.length
  if (expectedCount !== delta.resultCount) return false
  if (!delta.removed.every(id => claim(id, true))) return false
  if (!delta.added.every(({ index, item }) => claim(item.id, false)
    && index >= 0 && index < delta.resultCount)) return false
  if (!delta.changed.every(item => present.has(item.id))) return false
  return delta.moved.every(({ index, id }) => present.has(id)
    && !delta.removed.includes(id)
    && index >= 0 && index < delta.resultCount)
}

/**
 * Indices of the longest strictly increasing subsequence of the given numbers.
 * Used to decide which items keep their place when a result is reordered: everything outside the
 * subsequence has to move, everything inside it is already in the right relative order.
 * @param sequence - The numbers to inspect.
 * @returns The indices into `sequence` that form the longest increasing subsequence.
 */
function longestIncreasingSubsequence(sequence: number[]): number[] {
  if (sequence.length === 0) return []
  // `tails[length - 1]` is the index of the smallest possible tail of an increasing subsequence of
  // that length; `previous` links each index back to its predecessor so the run can be walked out.
  const tails: number[] = []
  const previous: number[] = Array.from<number>({ length: sequence.length }).fill(-1)

  for (let index = 0; index < sequence.length; index += 1) {
    const value = sequence[index]
    let low = 0
    let high = tails.length
    while (low < high) {
      const middle = (low + high) >> 1
      if (sequence[tails[middle]] < value) {
        low = middle + 1
      } else {
        high = middle
      }
    }
    if (low > 0) previous[index] = tails[low - 1]
    tails[low] = index
  }

  const result: number[] = []
  let cursor = tails.at(-1) as number
  while (cursor !== -1) {
    result.push(cursor)
    cursor = previous[cursor]
  }
  return result.toReversed()
}

/**
 * Computes the delta between two results of the same query.
 *
 * A fallback for the cases where the change that produced the new result is not available — a query
 * that had to be re-executed in full, for instance. It costs a pass over both results, but it is
 * paid once, on the side that has both of them, instead of shipping the entire new result to
 * everyone who only needs to know what changed.
 * @template T - The type of the items.
 * @param previous - The result the delta should be relative to.
 * @param next - The result the delta should produce.
 * @returns The delta between the two results.
 */
export function diffQueryResults<T extends BaseItem>(previous: T[], next: T[]): QueryDelta<T> {
  const previousIndexById = new Map<any, number>()
  previous.forEach((item, index) => previousIndexById.set(item.id, index))
  const nextIds = new Set(next.map(item => item.id))

  const removed: any[] = []
  previous.forEach((item) => {
    if (!nextIds.has(item.id)) removed.push(item.id)
  })

  const added: { index: number, item: T }[] = []
  const changed: T[] = []
  // Positions in `previous` of the items that survive, in the order they appear in `next`. An
  // increasing run in here is a stretch of items whose relative order did not change.
  const survivingPreviousIndices: number[] = []
  const survivingNextIndices: number[] = []

  next.forEach((item, index) => {
    const previousIndex = previousIndexById.get(item.id)
    if (previousIndex == null) {
      added.push({ index, item })
      return
    }
    if (!isEqual(previous[previousIndex], item)) changed.push(item)
    survivingPreviousIndices.push(previousIndex)
    survivingNextIndices.push(index)
  })

  const stationary = new Set(
    longestIncreasingSubsequence(survivingPreviousIndices)
      .map(position => survivingNextIndices[position]),
  )
  const moved: { index: number, id: any }[] = []
  survivingNextIndices.forEach((nextIndex) => {
    if (stationary.has(nextIndex)) return
    moved.push({ index: nextIndex, id: next[nextIndex].id })
  })

  return { added, changed, removed, moved, resultCount: next.length }
}

/**
 * Applies a delta to the result it was computed against.
 * @template T - The type of the items.
 * @param previous - The result the delta is relative to. Not modified.
 * @param delta - The delta to apply.
 * @returns The resulting items.
 */
export function applyQueryDelta<T extends BaseItem>(previous: T[], delta: QueryDelta<T>): T[] {
  const removed = new Set(delta.removed)
  const changedById = new Map(delta.changed.map(item => [item.id, item]))
  const movedIds = new Set(delta.moved.map(({ id }) => id))

  const stationary: T[] = []
  const byId = new Map<any, T>()
  previous.forEach((item) => {
    if (removed.has(item.id)) return
    const current = changedById.get(item.id) ?? item
    byId.set(current.id, current)
    if (!movedIds.has(current.id)) stationary.push(current)
  })

  // Insertions carry positions in the resulting array, so splicing them in ascending order lands
  // every one of them at its final index — each is placed only after everything before it is there.
  const insertions = [
    ...delta.added.map(({ index, item }) => ({ index, item })),
    ...delta.moved.map(({ index, id }) => ({ index, item: byId.get(id) as T })),
  ].sort((a, b) => a.index - b.index) // eslint-disable-line unicorn/no-array-sort -- unavailable on Hermes

  const result = stationary
  insertions.forEach(({ index, item }) => {
    if (item == null) return
    result.splice(index, 0, item)
  })
  return result
}
