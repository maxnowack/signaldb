import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'
import maverickjsReactivityAdapter from '@signaldb/maverickjs'
import syncManager from '../system/syncManager'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter,
  onError: (collectionName, error) => {
    // eslint-disable-next-line no-console
    console.error(`DataAdapter Error (${collectionName}):`, error)
  },
})
const Todos = new Collection<{ id: string, text: string, completed: boolean }>('todos-supabase', dataAdapter, {
  reactivity: maverickjsReactivityAdapter,
})

syncManager.addCollection(Todos, { name: 'todos' })
void syncManager.syncAll()

export default Todos
