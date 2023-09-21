import {
  addRxPlugin,
  createRxDatabase,
} from 'rxdb'
import {
  getRxStorageDexie,
} from 'rxdb/plugins/storage-dexie'
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election'
import { RxDBUpdatePlugin } from 'rxdb/plugins/update'
import createRxPersistenceAdapter from '../../utils/createRxPersistenceAdapter'

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

const persistence = createRxPersistenceAdapter<{
  id: string,
  text: string,
  completed: boolean,
}, string>(() => collectionPromise)

export default persistence
