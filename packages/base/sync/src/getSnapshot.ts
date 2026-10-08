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

  // copy the array to not mutate the last snapshot
  const items = [...lastSnapshot || []]
  for (const item of data.changes.added) {
    const index = items.findIndex(i => i.id === item.id)
    if (index === -1) {
      items.push(item)
    } else {
      items[index] = item
    }
  }
  for (const item of data.changes.modified) {
    const index = items.findIndex(i => i.id === item.id)
    if (index === -1) {
      items.push(item)
    } else {
      items[index] = item
    }
  }
  for (const item of data.changes.removed) {
    const index = items.findIndex(i => i.id === item.id)
    if (index !== -1) items.splice(index, 1)
  }
  return items
}
