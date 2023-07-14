import { Collection } from '@exodb/core'
import reactivity from './reactivity'
import persistence from './persistence'

export default function setupCollection() {
  const collection = new Collection<{ id: string, text: string, completed: boolean }>({
    memory: [],
    reactivity,
    persistence,
  })
  collection.on('persistence.error', (error) => {
    // eslint-disable-next-line no-console
    console.error('persistence.error', error)
  })
  return collection
}
