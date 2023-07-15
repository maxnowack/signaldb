import {
  addRxPlugin,
  createRxDatabase,
} from 'rxdb'
import {
  getRxStorageDexie,
} from 'rxdb/plugins/storage-dexie'
import type { PersistenceAdapter } from 'signaldb'
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election'
import { RxDBUpdatePlugin } from 'rxdb/plugins/update'

addRxPlugin(RxDBLeaderElectionPlugin)
addRxPlugin(RxDBUpdatePlugin)

const todoSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: {
      type: 'string',
    },
    text: {
      type: 'string',
    },
    completed: {
      type: 'boolean',
    },
  },
  required: [
    'id',
    'text',
  ],
}

const dbPromise = createRxDatabase({
  name: 'tododb',
  storage: getRxStorageDexie(),
}).then(async (db) => {
  await db.waitForLeadership()
  return db
})

const collectionPromise = dbPromise.then(async (db) => {
  await db.addCollections({
    todos: {
      schema: todoSchema,
    },
  })
  return db.collections.todos
})

const persistence: PersistenceAdapter<{ id: string, text: string, completed: boolean }, string> = {
  register: async (onChange) => {
    const collection = await collectionPromise
    collection.postInsert(() => onChange(), false)
    collection.postRemove(() => onChange(), false)
    collection.postSave(() => onChange(), false)
  },
  save: async (_items, changes) => {
    const collection = await collectionPromise
    await Promise.all([
      ...changes.added.map(item => collection.insert(item)),
      ...changes.modified.map(async (item) => {
        const doc = await collection.findOne({ selector: { id: item.id } }).exec()
        if (doc) await doc.update({ $set: item })
      }),
      ...changes.removed.map(async (item) => {
        const doc = await collection.findOne({ selector: { id: item.id } }).exec()
        if (doc) await doc.remove()
      }),
    ])
  },
  load: async () => {
    const collection = await collectionPromise
    const items = await collection.find().exec()
    return { items: items.map(item => item.toMutableJSON()) }
  },
}

export default persistence
