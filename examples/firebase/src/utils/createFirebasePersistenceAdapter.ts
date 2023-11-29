import { initializeApp } from 'firebase/app'
import { getDatabase, ref, get, set, remove, update, onChildAdded, onChildChanged, onChildRemoved } from 'firebase/database'
import { createPersistenceAdapter } from 'signaldb'

export default function createFirebasePersistenceAdapter<
  T extends { id: U },
  U extends string | number,
>(
  collectionRef: string,
) {
  initializeApp({
    databaseURL: 'https://signaldb-d7e71-default-rtdb.firebaseio.com',
  })
  const db = getDatabase()

  return createPersistenceAdapter<T, U>({
    register: async (onChange) => {
      const handleChange = () => {
        void onChange()
      }
      onChildAdded(ref(db, collectionRef), () => { void handleChange() })
      onChildChanged(ref(db, collectionRef), () => { void handleChange() })
      onChildRemoved(ref(db, collectionRef), () => { void handleChange() })
      return Promise.resolve()
    },
    save: async (_items, changes) => {
      await Promise.all([
        ...changes.added.map(async (item) => {
          await set(ref(db, `${collectionRef}/${item.id}`), item)
        }),
        ...changes.modified.map(async (item) => {
          await update(ref(db, `${collectionRef}/${item.id}`), item)
        }),
        ...changes.removed.map(async (item) => {
          await remove(ref(db, `${collectionRef}/${item.id}`))
        }),
      ])
    },
    load: async () => {
      const snapshot = await get(ref(db, collectionRef))
      const items = await snapshot.val() as Record<U, T> | null
      return { items: Object.values(items ?? {}) }
    },
  })
}
