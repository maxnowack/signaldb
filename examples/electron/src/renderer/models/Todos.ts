import { Collection } from '@signaldb/core'
import maverickjsReactivityAdapter from '@signaldb/maverickjs'
import { createElectronAdapter } from '@signaldb/electron/renderer'

const Todos = new Collection<{ id: string, text: string, completed: boolean }>({
  reactivity: maverickjsReactivityAdapter,
  persistence: createElectronAdapter('todos'),
})
Todos.on('persistence.error', (error) => {
  // eslint-disable-next-line no-console
  console.error('persistence.error', error)
})

export default Todos
