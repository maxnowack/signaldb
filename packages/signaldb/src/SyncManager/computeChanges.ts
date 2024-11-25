import isEqual from '../utils/isEqual'

/**
 * Compute changes between two arrays of items.
 * @param oldItems Array of the old items
 * @param newItems Array of the new items
 * @returns The changeset
 */
export default function computeChanges<T extends Record<string, any>>(
  oldItems: T[],
  newItems: T[],
) {
  const added: T[] = []
  const modified: T[] = []
  const removed: T[] = []

  const oldItemsMap = new Map(oldItems.map(item => [item.id, item]))
  const newItemsMap = new Map(newItems.map(item => [item.id, item]))

  for (const [id, oldItem] of oldItemsMap) {
    const newItem = newItemsMap.get(id)
    if (!newItem) {
      removed.push(oldItem)
    } else if (!isEqual(newItem, oldItem)) {
      modified.push(newItem)
    }
  }

  for (const [id, newItem] of newItemsMap) {
    if (!oldItemsMap.has(id)) {
      added.push(newItem)
    }
  }

  return { added, modified, removed }
}
