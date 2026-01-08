import { DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'replication-http-todos',
    version: 1,
    schema: {
      'todos-http': [],
      'http-sync-manager-changes': ['collectionName'],
      'http-sync-manager-snapshots': ['collectionName'],
      'http-sync-manager-sync-operations': ['collectionName', 'status'],
    },
  }),
  onError: (collectionName, error) => {
    // eslint-disable-next-line no-console
    console.error(`DataAdapter Error (${collectionName}):`, error)
  },
})

export default dataAdapter
