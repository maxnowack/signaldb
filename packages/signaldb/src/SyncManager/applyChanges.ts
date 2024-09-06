import type { BaseItem } from '../Collection'
import Collection from '../Collection'
import type { Change } from './types'

export default function applyChanges<ItemType extends BaseItem<IdType>, IdType>(
  items: ItemType[],
  changes: Change<ItemType, IdType>[],
) {
  const collection = new Collection<ItemType, IdType>()
  items.forEach(item => collection.insert(item))
  changes.forEach((change) => {
    if (change.type === 'insert') {
      collection.insert(change.data)
    } else if (change.type === 'update') {
      collection.updateOne({ id: change.data.id } as Record<string, any>, change.data.modifier)
    } else if (change.type === 'remove') {
      collection.removeOne({ id: change.data } as Record<string, any>)
    }
  })
  return collection.find().fetch()
}
