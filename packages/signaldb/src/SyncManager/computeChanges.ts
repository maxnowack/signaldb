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

  oldItems.forEach((oldItem) => {
    const newItem = newItems.find(item => item.id === oldItem.id)
    if (!newItem) {
      removed.push(oldItem)
      return
    }
    if (!isEqual(newItem, oldItem)) modified.push(newItem)
  })
  newItems.forEach((newItem) => {
    const oldItem = oldItems.find(item => item.id === newItem.id)
    if (oldItem) return
    added.push(newItem)
  })

  return { added, modified, removed }
}
