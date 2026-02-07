import type { BaseItem } from '@signaldb/core'
import type { LoadResponse } from './types'

/**
 * Gets the snapshot of items from the last snapshot and the changes.
 * @param lastSnapshot The last snapshot of items
 * @param data The changes to apply to the last snapshot
 * @returns The new snapshot of items
 */
export default function getSnapshot<ItemType extends BaseItem<IdType>, IdType>(
  lastSnapshot: ItemType[] | undefined,
  data: LoadResponse<ItemType>,
) {
  if (data.items != null) return data.items

  const items = lastSnapshot || []
  data.changes.added.forEach((item) => {
    const index = items.findIndex(i => i.id === item.id)
    if (index === -1) {
      items.push(item)
    } else {
      items[index] = item
    }
  })
  data.changes.modified.forEach((item) => {
    const index = items.findIndex(i => i.id === item.id)
    if (index === -1) {
      items.push(item)
    } else {
      items[index] = item
    }
  })
  data.changes.removed.forEach((item) => {
    const index = items.findIndex(i => i.id === item.id)
    if (index !== -1) items.splice(index, 1)
  })
  return items
}
