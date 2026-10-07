---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/indexeddb/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/indexeddb/
- - meta
  - name: og:title
    content: '@signaldb/indexeddb | SignalDB'
- - meta
  - name: og:description
    content: Learn how to use the IndexedDB Adapter in SignalDB for robust and efficient browser data storage.
- - meta
  - name: description
    content: Learn how to use the IndexedDB Adapter in SignalDB for robust and efficient browser data storage.
- - meta
  - name: keywords
    content: SignalDB, IndexedDB adapter, data persistence, browser storage, JavaScript, TypeScript, data management, IndexedDB, collection setup, SignalDB adapters
---
# @signaldb/indexeddb

## createIndexedDBAdapter (`default`)

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 1,
    schema: {
      posts: ['authorId'],
    },
  }),
})

const Posts = new Collection('posts', dataAdapter)
```

One IndexedDB database holds every collection of your application. You describe
that database once — its name, its version and its stores — and
`createIndexedDBAdapter` returns the `storage` function a data adapter asks for
the store belonging to a collection. Each key of `schema` is a store name and
must match the name you give the collection; its value lists the fields to
index inside that store.

### Parameters

- `options` - An `IndexedDBOptions` object (exported as a type from `@signaldb/indexeddb`):

  ```ts
  type IndexedDBOptions = {
    databaseName?: string,
    version: number,
    schema: Record<string, string[]>,
    onUpgrade?: (
      database: IDBDatabase,
      transaction: IDBTransaction,
      oldVersion: number,
      newVersion: number | null,
    ) => Promise<void>,
  }
  ```

  - `databaseName` - (Optional) The name of the IndexedDB database. Default is `'signaldb'`.
  - `version` - The version of the database schema, passed to `indexedDB.open()`. Raise it whenever you change `schema`; the stores are only reconciled during a version upgrade.
  - `schema` - An object describing the stores. Keys are store names, values are the fields to index in that store. Every store uses `id` as its key path, so `id` never needs to be listed.
  - `onUpgrade` - (Optional) Async callback `(database, transaction, oldVersion, newVersion)` invoked during a version upgrade, before SignalDB reconciles the stores. The upgrade waits for the returned promise.

Stores present in the database but absent from `schema` are dropped on upgrade,
so the schema is the complete description of what the database holds.

### Examples

Basic usage:

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 1,
    schema: { users: [] },
  }),
})

const Users = new Collection('users', dataAdapter)

// Insert data — writes are asynchronous
await Users.insert({ id: '1', name: 'John Doe' })

// Fetch data
const items = Users.find().fetch()
console.log(items) // [{ id: '1', name: 'John Doe' }]
```

Several collections in one database, with indices:

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 2,
    schema: {
      'posts': ['authorId', 'status'],
      'authors': [],
    },
  }),
})

const Posts = new Collection('posts', dataAdapter, {
  indices: ['authorId', 'status'],
})
const Authors = new Collection('authors', dataAdapter)
```

The fields you list in the store's `schema` entry and the collection's
`indices` describe the same thing from two sides: the store has to carry the
index, and the collection has to know it may use it.

### Using it with a `SyncManager`

When you pass the same data adapter to a [`SyncManager`](/reference/sync/)
from `@signaldb/sync`, the sync manager stores its own bookkeeping in three
collections of that data adapter, named after its `id`. Each of them needs a
store in `schema`, with these indices:

| Store | Indices |
|---|---|
| `<id>-changes` | `collectionName` |
| `<id>-snapshots` | `collectionName` |
| `<id>-sync-operations` | `collectionName`, `status` |

Always set `id` explicitly when you persist the sync manager's data, so the
store names are under your control:

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'
import { SyncManager } from '@signaldb/sync'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 1,
    schema: {
      'posts': [],
      'app-changes': ['collectionName'],
      'app-snapshots': ['collectionName'],
      'app-sync-operations': ['collectionName', 'status'],
    },
  }),
})

const Posts = new Collection('posts', dataAdapter)

const syncManager = new SyncManager({
  id: 'app',
  dataAdapter,
  pull: async () => { /* … */ },
  push: async () => { /* … */ },
})
syncManager.addCollection(Posts, { name: 'posts' })
```

Because stores that are missing from `schema` are dropped on upgrade, leaving
these entries out also discards the sync manager's record of unsynced changes
the next time you raise `version`.
