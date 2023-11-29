import { Client, Databases } from 'appwrite'
import { createPersistenceAdapter } from 'signaldb'

const client = new Client()
client
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('6567685ea287ba49be81')

const dbId = '65676881edfe6a3e7e2c'
const db = new Databases(client)

export default function createAppwritePersistenceAdapter<
  T extends { id: U },
  U extends string,
>(
  collectionId: string,
) {
  return createPersistenceAdapter<T, U>({
    register: async (onChange) => {
      const handleChange = () => {
        void onChange()
      }
      client.subscribe(`databases.${dbId}.collections.${collectionId}.documents`, handleChange)
      return Promise.resolve()
    },
    save: async (_items, changes) => {
      await Promise.all([
        ...changes.added.map(async ({ id, ...item }) => {
          await db.createDocument(dbId, collectionId, id, item)
        }),
        ...changes.modified.map(async ({ id, ...item }) => {
          await db.updateDocument(dbId, collectionId, id, item)
        }),
        ...changes.removed.map(async (item) => {
          await db.deleteDocument(dbId, collectionId, item.id)
        }),
      ])
    },
    load: async () => {
      const { documents } = await db.listDocuments(dbId, collectionId)
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
        } as unknown as T)) }
    },
  })
}
