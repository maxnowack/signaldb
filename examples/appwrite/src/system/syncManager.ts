import { Client, Databases } from 'appwrite'
import { SyncManager } from '@signaldb/sync'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const client = new Client()
client
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('6567685ea287ba49be81')

const databaseId = '65676881edfe6a3e7e2c'
const database = new Databases(client)

const syncManager = new SyncManager<Record<string, any>, { id: string }>({
  id: 'appwrite-sync-manager',
  persistenceAdapter: id => createIndexedDBAdapter(id),
  onError: (options, error) => {
    // eslint-disable-next-line no-console
    console.error(options, error)
  },
  registerRemoteChange({ name }, onChange) {
    const handleChange = () => {
      void onChange()
    }
    client.subscribe(`databases.${databaseId}.collections.${name}.documents`, handleChange)
  },
  async pull({ name }) {
    const { documents } = await database.listDocuments(databaseId, name)
    return {
      items: documents.map(({
        $collectionId,
        $createdAt,
        $databaseId,
        $id,
        $permissions,
        $updatedAt,
        ...item
      }) => ({
        id: $id,
        ...item,
      } as unknown as { id: string })) }
  },
  async push({ name }, { changes }) {
    await Promise.all([
      ...changes.added.map(async ({ id, ...item }) => {
        await database.createDocument(databaseId, name, id, item)
      }),
      ...changes.modified.map(async ({ id, ...item }) => {
        await database.updateDocument(databaseId, name, id, item)
      }),
      ...changes.removed.map(async (item) => {
        await database.deleteDocument(databaseId, name, item.id)
      }),
    ])
  },
})

export default syncManager
