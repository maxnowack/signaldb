import { DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'supabase-todos',
    version: 1,
    schema: {
      'todos-supabase': [],
      'supabase-sync-manager-changes': ['collectionName'],
      'supabase-sync-manager-snapshots': ['collectionName'],
      'supabase-sync-manager-sync-operations': ['collectionName', 'status'],
    },
  }),
  onError: (collectionName, error) => {
    // eslint-disable-next-line no-console
    console.error(`DataAdapter Error (${collectionName}):`, error)
  },
})

export default dataAdapter
