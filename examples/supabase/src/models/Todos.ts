import { Collection } from 'signaldb'
import maverickjsReactivityAdapter from 'signaldb-plugin-maverickjs'
import createSupabasePersistenceAdapter from '../utils/createSupabasePersistenceAdapter'

const Todos = new Collection<{ id: string, text: string, completed: boolean }>({
  memory: [],
  reactivity: maverickjsReactivityAdapter,
  persistence: createSupabasePersistenceAdapter<{
    id: string,
    text: string,
    completed: boolean,
  }, string>('todos'),
})
Todos.on('persistence.error', (error) => {
  // eslint-disable-next-line no-console
  console.error('persistence.error', error)
})

export default Todos
