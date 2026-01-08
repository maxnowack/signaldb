import { DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'appwrite-todos',
    version: 1,
    schema: {
      'todos-appwrite': [],
      'appwrite-sync-manager-changes': ['collectionName'],
      'appwrite-sync-manager-snapshots': ['collectionName'],
      'appwrite-sync-manager-sync-operations': ['collectionName', 'status'],
    },
  }),
  onError: (collectionName, error) => {
    // eslint-disable-next-line no-console
    console.error(`DataAdapter Error (${collectionName}):`, error)
  },
})

export default dataAdapter
