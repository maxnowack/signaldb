import type { BaseItem } from '../Collection'
import type { LoadResponse } from '../types/PersistenceAdapter'

export default function getSnapshot<ItemType extends BaseItem<IdType>, IdType>(
  lastSnapshot: ItemType[] | undefined,
  data: LoadResponse<ItemType>,
) {
  if (data.items != null) return data.items

  const items = lastSnapshot || []
  data.changes.added.forEach(item => items.push(item))
  data.changes.modified.forEach((item) => {
    const index = items.findIndex(i => i.id === item.id)
    if (index !== -1) items[index] = item
  })
  data.changes.removed.forEach((item) => {
    const index = items.findIndex(i => i.id === item.id)
    if (index !== -1) items.splice(index, 1)
  })
  return items
}
