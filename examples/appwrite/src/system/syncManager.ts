import { Client, Databases } from 'appwrite'
import { SyncManager } from 'signaldb-sync'
import createLocalStorageAdapter from 'signaldb-localstorage'

const client = new Client()
client
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('6567685ea287ba49be81')

const dbId = '65676881edfe6a3e7e2c'
const db = new Databases(client)

const syncManager = new SyncManager<Record<string, any>, { id: string }>({
  persistenceAdapter: id => createLocalStorageAdapter(id),
  onError: (options, error) => {
    // eslint-disable-next-line no-console
    console.error(options, error)
  },
  registerRemoteChange({ name }, onChange) {
    const handleChange = () => {
      void onChange()
    }
    client.subscribe(`databases.${dbId}.collections.${name}.documents`, handleChange)
  },
  async pull({ name }) {
    const { documents } = await db.listDocuments(dbId, name)
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
        await db.createDocument(dbId, name, id, item)
      }),
      ...changes.modified.map(async ({ id, ...item }) => {
        await db.updateDocument(dbId, name, id, item)
      }),
      ...changes.removed.map(async (item) => {
        await db.deleteDocument(dbId, name, item.id)
      }),
    ])
  },
})

export default syncManager
