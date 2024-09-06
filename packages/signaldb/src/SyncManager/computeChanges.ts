import isEqual from '../utils/isEqual'

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
