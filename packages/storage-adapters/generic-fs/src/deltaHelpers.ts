import { get } from '@signaldb/core'

export type IndexDelta<I> = {
  adds: Map<string, Set<I>>,
  removes: Map<string, Set<I>>,
}

/**
 * Records a single index mutation into the delta map for a given indexed field.
 *
 * The delta map is grouped by `fieldPath`, and then by stringified key (`rawKey`).
 * Each key maps to a set of identifiers to add/remove for that key.
 * @param deltas - Accumulator of per-field index deltas.
 * @param fieldPath - Dot-path of the indexed field (used as the delta bucket key).
 * @param changeKind - Whether this identifier should be added to or removed from the index key.
 * @param rawKey - The stringified index key value.
 * @param identifier - The item identifier to add/remove for `rawKey`.
 */
export function addToDelta<I>(
  deltas: Map<string, IndexDelta<I>>,
  fieldPath: string,
  changeKind: 'add' | 'remove',
  rawKey: string,
  identifier: I,
) {
  if (!deltas.has(fieldPath)) deltas.set(fieldPath, { adds: new Map(), removes: new Map() })
  const delta = deltas.get(fieldPath)
  if (!delta) return
  const target = changeKind === 'add' ? delta.adds : delta.removes
  if (!target.has(rawKey)) target.set(rawKey, new Set<I>())
  target.get(rawKey)?.add(identifier)
}

/**
 * Computes the delta for a change in a single indexed field.
 *
 * Values are coerced to string keys (with `null`/`undefined` treated as "no key").
 * If the derived keys are equal, no delta is recorded.
 * @param deltas - Accumulator of per-field index deltas.
 * @param fieldPath - Dot-path of the indexed field being tracked.
 * @param oldValue - Previous value of the field.
 * @param newValue - Next value of the field.
 * @param identifier - The item identifier affected by the change.
 */
export function addDeltaForChange<I>(
  deltas: Map<string, IndexDelta<I>>,
  fieldPath: string,
  oldValue: any,
  newValue: any,
  identifier: I,
) {
  const oldKey = oldValue == null ? undefined : String(oldValue)
  const newKey = newValue == null ? undefined : String(newValue)
  if (oldKey === newKey) return
  if (oldKey != null) addToDelta(deltas, fieldPath, 'remove', oldKey, identifier)
  if (newKey != null) addToDelta(deltas, fieldPath, 'add', newKey, identifier)
}

/**
 * Accumulates index deltas for an upsert operation.
 *
 * - If `existingItem` is present, compares each maintained index field between the old and new item,
 *   recording removes/adds for key changes.
 * - If `existingItem` is absent, treats the operation as an insert and records adds for each
 *   maintained index field that has a non-null value.
 * @param deltas - Accumulator of per-field index deltas.
 * @param indicesToMaintain - List of dot-paths for fields that are indexed.
 * @param existingItem - Previous stored item (if any).
 * @param nextItem - Incoming item to upsert.
 */
export const accumulateUpsertDelta = <T extends { id: I }, I>(
  deltas: Map<string, IndexDelta<I>>,
  indicesToMaintain: string[],
  existingItem: T | undefined,
  nextItem: T,
) => {
  if (existingItem) {
    for (const fieldPath of indicesToMaintain) {
      addDeltaForChange(
        deltas,
        fieldPath,
        get(existingItem, fieldPath),
        get(nextItem, fieldPath),
        nextItem.id,
      )
    }
  } else {
    for (const fieldPath of indicesToMaintain) {
      const value = get(nextItem, fieldPath)
      if (value == null) continue
      addToDelta(deltas, fieldPath, 'add', String(value), nextItem.id)
    }
  }
}

/**
 * Accumulates index deltas for a remove/delete operation.
 *
 * For each maintained index field, records a removal of the item's identifier from the
 * corresponding stringified key (skipping `null`/`undefined` values).
 * @param deltas - Accumulator of per-field index deltas.
 * @param indicesToMaintain - List of dot-paths for fields that are indexed.
 * @param existingItem - The item being removed.
 */
export function accumulateRemoveDelta<T extends { id: I }, I>(
  deltas: Map<string, IndexDelta<I>>,
  indicesToMaintain: string[],
  existingItem: T,
) {
  for (const fieldPath of indicesToMaintain) {
    const value = get(existingItem, fieldPath)
    if (value == null) continue
    addToDelta(deltas, fieldPath, 'remove', String(value), existingItem.id)
  }
}
