import { Collection } from 'signaldb'
import maverickjsReactivityAdapter from 'signaldb-plugin-maverickjs'
import persistence from './persistence'

export default function setupCollection() {
  const collection = new Collection<{ id: string, text: string, completed: boolean }>({
    memory: [],
    reactivity: maverickjsReactivityAdapter,
    persistence,
  })
  collection.on('persistence.error', (error) => {
    // eslint-disable-next-line no-console
    console.error('persistence.error', error)
  })
  return collection
}
