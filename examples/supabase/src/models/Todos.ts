import { Collection } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'
import maverickjsReactivityAdapter from '@signaldb/maverickjs'
import syncManager from '../system/syncManager'

const Todos = new Collection<{ id: string, text: string, completed: boolean }>({
  name: 'todos-supabase',
  reactivity: maverickjsReactivityAdapter,
  persistence: createIndexedDBAdapter('todos-supabase'),
})
Todos.on('persistence.error', (error) => {
  // eslint-disable-next-line no-console
  console.error('persistence.error', error)
})

syncManager.addCollection(Todos, { name: 'todos' })
void syncManager.syncAll()

export default Todos
