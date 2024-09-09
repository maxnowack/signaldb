import type { BaseItem } from 'signaldb/Collection/types'
import type Modifier from 'signaldb/types/Modifier'
import type { Changeset, LoadResponse } from 'signaldb/types/PersistenceAdapter'
import computeChanges from './computeChanges'
import type { Change } from './types'
import getSnapshot from './getSnapshot'
import applyChanges from './applyChanges'

function hasChanges<T>(
  changes: Changeset<T>,
) {
  return changes.added.length > 0
    || changes.modified.length > 0
    || changes.removed.length > 0
}
function hasDifference<ItemType extends BaseItem<IdType>, IdType>(
  oldItems: ItemType[],
  newItems: ItemType[],
) {
  return hasChanges(computeChanges(oldItems, newItems))
}

interface Options<ItemType extends BaseItem<IdType>, IdType> {
  changes: Change<ItemType, IdType>[],
  lastSnapshot?: ItemType[],
  data: LoadResponse<ItemType>,
  pull: () => Promise<LoadResponse<ItemType>>,
  push: (changes: Changeset<ItemType>) => Promise<void>,
  insert: (item: ItemType) => void,
  update: (id: IdType, modifier: Modifier<ItemType>) => void,
  remove: (id: IdType) => void,
}

/**
 * Does a sync operation based on the provided options. If changes are supplied, these will be rebased on the new data.
 * Afterwards the push method will be called with the remaining changes. A new snapshot will be created and returned.
 * @param options Sync options
 * @param options.changes Changes to call the push method with
 * @param [options.lastSnapshot] The last snapshot
 * @param options.data The new data
 * @param options.pull Method to pull new data
 * @param options.push Method to push changes
 * @param options.insert Method to insert an item
 * @param options.update Method to update an item
 * @param options.remove Method to remove an item
 * @returns The new snapshot
 */
export default async function sync<ItemType extends BaseItem<IdType>, IdType>({
  changes,
  lastSnapshot,
  data,
  pull,
  push,
  insert,
  update,
  remove,
}: Options<ItemType, IdType>): Promise<ItemType[]> {
  let newData = data
  let previousSnapshot = lastSnapshot || []
  let newSnapshot = getSnapshot(lastSnapshot, newData)
  if (changes.length > 0) {
    // apply changes on last snapshot and check if there is a difference
    const lastSnapshotWithChanges = applyChanges(previousSnapshot, changes)
    if (hasDifference(previousSnapshot, lastSnapshotWithChanges)) {
      // if yes, apply the changes on the newSnapshot and check if there is a difference
      const newSnapshotWithChanges = applyChanges(newSnapshot, changes)
      const changesToPush = computeChanges(newSnapshot, newSnapshotWithChanges)
      if (hasChanges(changesToPush)) {
        // if yes, push the changes to the server
        await push(changesToPush)

        // pull new data afterwards to ensure that all server changes are applied
        newData = await pull()
        newSnapshot = getSnapshot(newSnapshot, newData)
      }
      previousSnapshot = lastSnapshotWithChanges
    }
  }

  // apply the new changes on the collection
  const newChanges = newData.changes == null
    ? computeChanges(previousSnapshot, newData.items)
    : newData.changes
  newChanges.added.forEach(item => insert(item))
  newChanges.modified.forEach(item => update(item.id, { $set: item }))
  newChanges.removed.forEach(item => remove(item.id))

  return newSnapshot
}
