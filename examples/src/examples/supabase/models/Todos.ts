import { Collection } from '@signaldb/core'
import maverickjsReactivityAdapter from '@signaldb/maverickjs'
import syncManager from '../system/syncManager'
import dataAdapter from '../system/dataAdapter'

const Todos = new Collection<{ id: string, text: string, completed: boolean }>('todos-supabase', dataAdapter, {
  reactivity: maverickjsReactivityAdapter,
})

syncManager.addCollection(Todos, { name: 'todos' })
void syncManager.syncAll()

export default Todos
