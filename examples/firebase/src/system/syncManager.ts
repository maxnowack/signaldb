import { SyncManager } from 'signaldb-sync'
import createLocalStorageAdapter from 'signaldb-localstorage'
import { initializeApp } from 'firebase/app'
import { getDatabase, ref, get, set, remove, update, onChildAdded, onChildChanged, onChildRemoved } from 'firebase/database'

initializeApp({
  databaseURL: 'https://signaldb-d7e71-default-rtdb.firebaseio.com',
})
const db = getDatabase()

const syncManager = new SyncManager({
  persistenceAdapter: id => createLocalStorageAdapter(id),
  onError: (options, error) => {
    // eslint-disable-next-line no-console
    console.error(options, error)
  },
  registerRemoteChange({ name }, onChange) {
    const handleChange = () => {
      void onChange()
    }
    onChildAdded(ref(db, name), () => { void handleChange() })
    onChildChanged(ref(db, name), () => { void handleChange() })
    onChildRemoved(ref(db, name), () => { void handleChange() })
  },
  async pull({ name }) {
    const snapshot = await get(ref(db, name))
    const items = await snapshot.val() as Record<string, any> | null
    return { items: Object.values(items ?? {}) }
  },
  async push({ name }, { changes }) {
    await Promise.all([
      ...changes.added.map(async (item) => {
        await set(ref(db, `${name}/${item.id}`), item)
      }),
      ...changes.modified.map(async (item) => {
        await update(ref(db, `${name}/${item.id}`), item)
      }),
      ...changes.removed.map(async (item) => {
        await remove(ref(db, `${name}/${item.id}`))
      }),
    ])
  },
})

export default syncManager
