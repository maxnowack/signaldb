import { Client, TablesDB, Realtime } from 'appwrite'
import { SyncManager } from '@signaldb/sync'
import dataAdapter from './dataAdapter'

const client = new Client()
client
  .setEndpoint('https://cloud.appwrite.io/v1')
  .setProject('6567685ea287ba49be81')
const realtime = new Realtime(client)

const databaseId = '65676881edfe6a3e7e2c'
const database = new TablesDB(client)

const syncManager = new SyncManager<
  Record<string, any>,
  { id: string, text: string, completed: boolean }
>({
  id: 'appwrite-sync-manager',
  dataAdapter,
  onError: (options, error) => {
    // eslint-disable-next-line no-console
    console.error(options, error)
  },
  async registerRemoteChange({ name }, onChange) {
    const handleChange = () => {
      void onChange()
    }
    await realtime.subscribe(`databases.${databaseId}.collections.${name}.documents`, handleChange)
  },
  async pull({ name }) {
    const { rows } = await database.listRows({ databaseId, tableId: name })
    const items = rows.map(({
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
    })) as unknown as { id: string, text: string, completed: boolean }[]
    return { items }
  },
  async push({ name }, { changes }) {
    await Promise.all([
      ...changes.added.map(async ({ id, ...item }) => {
        await database.createRow({
          databaseId,
          tableId: name,
          rowId: id,
          data: item,
        })
      }),
      ...changes.modified.map(async ({ id, ...item }) => {
        await database.updateRow({
          databaseId,
          tableId: name,
          rowId: id,
          data: item,
        })
      }),
      ...changes.removed.map(async (item) => {
        await database.deleteRow({ databaseId, tableId: name, rowId: item.id })
      }),
    ])
  },
})

export default syncManager
