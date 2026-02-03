import { DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'firebase-todos',
    version: 1,
    schema: {
      'todos-firebase': [],
      'firebase-sync-manager-changes': ['collectionName'],
      'firebase-sync-manager-snapshots': ['collectionName'],
      'firebase-sync-manager-sync-operations': ['collectionName', 'status'],
    },
  }),
  onError: (collectionName, error) => {
    // eslint-disable-next-line no-console
    console.error(`DataAdapter Error (${collectionName}):`, error)
  },
})

export default dataAdapter
