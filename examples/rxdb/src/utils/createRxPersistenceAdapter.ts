import type { RxCollection } from 'rxdb'
import { createPersistenceAdapter } from 'signaldb'

export default function createRxPersistenceAdapter<T extends { id: U }, U>(
  getCollection: () => Promise<RxCollection<T>>,
) {
  return createPersistenceAdapter<T, U>({
    register: async (onChange) => {
      const handleChange = () => {
        void onChange()
      }
      const collection = await getCollection()
      collection.postInsert(() => { void handleChange() }, false)
      collection.postRemove(() => { void handleChange() }, false)
      collection.postSave(() => { void handleChange() }, false)
    },
    save: async (_items, changes) => {
      const collection = await getCollection()
      await Promise.all([
        ...changes.added.map(item => collection.insert(item)),
        ...changes.modified.map(async (item) => {
          const doc = await collection.findOne({ selector: { id: item.id } as any }).exec()
          if (doc) await doc.update({ $set: item })
        }),
        ...changes.removed.map(async (item) => {
          const doc = await collection.findOne({ selector: { id: item.id } as any }).exec()
          if (doc) await doc.remove()
        }),
      ]).then(() => undefined)
    },
    load: async () => {
      const collection = await getCollection()
      const items = await collection.find().exec()
        .then(docs => docs.map(item => item.toMutableJSON()))
      return { items }
    },
  })
}
