import { SyncManager } from '@signaldb/sync'
import { initializeApp } from 'firebase/app'
import { getDatabase, ref, get, set, remove, update, onChildAdded, onChildChanged, onChildRemoved } from 'firebase/database'
import dataAdapter from './dataAdapter'

initializeApp({
  databaseURL: 'https://signaldb-d7e71-default-rtdb.firebaseio.com',
})
const database = getDatabase()

const syncManager = new SyncManager<
  Record<string, any>,
  { id: string, text: string, completed: boolean }
>({
  id: 'firebase-sync-manager',
  dataAdapter,
  onError: (options, error) => {
    // eslint-disable-next-line no-console
    console.error(options, error)
  },
  registerRemoteChange({ name }, onChange) {
    const handleChange = () => {
      void onChange()
    }
    onChildAdded(ref(database, name), () => {
      void handleChange()
    })
    onChildChanged(ref(database, name), () => {
      void handleChange()
    })
    onChildRemoved(ref(database, name), () => {
      void handleChange()
    })
  },
  async pull({ name }) {
    const snapshot = await get(ref(database, name))
    const items = await snapshot.val() as Record<string, any> | null
    return { items: Object.values(items ?? {}) }
  },
  async push({ name }, { changes }) {
    await Promise.all([
      ...changes.added.map(async (item) => {
        await set(ref(database, `${name}/${item.id}`), item)
      }),
      ...changes.modified.map(async (item) => {
        await update(ref(database, `${name}/${item.id}`), item)
      }),
      ...changes.removed.map(async (item) => {
        await remove(ref(database, `${name}/${item.id}`))
      }),
    ])
  },
})

export default syncManager
