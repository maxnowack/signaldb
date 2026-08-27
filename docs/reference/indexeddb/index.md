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

- `options` - Configuration object with the following properties:
  - `databaseName` - (Optional) The name of the IndexedDB database. Default is `'signaldb'`.
  - `version` - The version of the database schema. Raise it whenever you change `schema`.
  - `schema` - An object describing the stores. Keys are store names, values are the fields to index in that store.
  - `onUpgrade` - (Optional) Callback `(database, transaction, oldVersion, newVersion)` invoked during a version upgrade, before SignalDB reconciles the stores.

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
