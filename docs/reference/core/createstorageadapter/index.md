---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/createstorageadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/createstorageadapter/
- - meta
  - name: og:title
    content: createStorageAdapter | SignalDB
- - meta
  - name: og:description
    content: Learn how to implement custom storage adapters for SignalDB to meet specific requirements on a practical example using the File System.
- - meta
  - name: description
    content: Learn how to implement custom storage adapters for SignalDB to meet specific requirements on a practical example using the File System.
- - meta
  - name: keywords
    content: SignalDB, custom storage adapters, createStorageAdapter, data storage, File System adapter, JavaScript, TypeScript, data storage, adapter implementation, SignalDB extensions
---
# createStorageAdapter

```ts
import { createStorageAdapter } from '@signaldb/core'
```

While SignalDB comes with a few built-in storage adapters, there may be
scenarios where you need to write one for a backend of your own.

A storage adapter persists documents and finds them again. It never sees a
query — see [why that is](/data-persistence/#why-a-storage-adapter-never-sees-a-selector).
It is reached through a [data adapter](/data-adapters/), which is what decides
*where* the data operations run.

Create one by calling `createStorageAdapter` with an object implementing
`StorageAdapter`:

```ts
interface StorageAdapter<T extends { id: I }, I> {
  // lifecycle
  setup(): Promise<void>
  teardown(): Promise<void>

  // reading
  readAll(): Promise<T[]>
  readIds(ids: I[]): Promise<T[]>

  // indices
  createIndex(field: string): Promise<void>
  dropIndex(field: string): Promise<void>
  readIndex(field: string): Promise<Map<string | null, Set<I>>>

  // writing
  insert(items: T[]): Promise<void>
  replace(items: T[]): Promise<void>
  remove(items: T[]): Promise<void>
  removeAll(): Promise<void>
}
```

* **setup** is called once before the collection is used. Open your connection, create your directory, run your migration here.
* **teardown** is called when the collection is disposed. Clean up what `setup` acquired.
* **readAll** returns every document. This is what answers a query no index covers, so it is the cost you pay for an unindexed selector.
* **readIds** returns the documents for the given ids, in any order, omitting ids that do not exist. Every backend can look something up by its key, which is why this is part of the interface rather than something you declare — `{ id: 'x' }` and `{ id: { $in: [...] } }` are resolved through it.
* **createIndex** / **dropIndex** are called for the fields a collection declares in `indices`. An adapter that cannot index may implement them as no-ops, as long as `readIndex` then reports what it actually has.
* **readIndex** returns the index for one field: a map from value to the set of ids carrying it. **The keys are `serializeValue(value)`, not the raw field values** — see below.
* **insert**, **replace**, **remove** write and delete the given documents; **removeAll** empties the collection.

## Index keys

This is the one part that is easy to get wrong and hard to notice.

`readIndex` is keyed by `serializeValue(value)`, because that is what makes
`3`, `'3'` and a `Date` comparable as map keys at all — and it is what SignalDB
looks the index up with. An adapter that stores its backend's own keys instead
answers **nothing** for every non-string field and **everything** for a `$ne` on
one. String-valued fields keep working, which is exactly why this can sit
unnoticed for a long time.

```ts
import { serializeValue } from '@signaldb/core'

const key = serializeValue(item[field])
```

`@signaldb/indexeddb` shipped with this bug in v1 for precisely that reason.

## Example

A minimal in-memory adapter — the shape to start from, and useful in tests:

```ts
import { createStorageAdapter, serializeValue } from '@signaldb/core'

export default function createMemoryAdapter<T extends { id: I }, I>() {
  const items = new Map<I, T>()
  const indices = new Map<string, Map<string | null, Set<I>>>()

  const rebuild = () => {
    indices.forEach((index, field) => {
      index.clear()
      items.forEach((item) => {
        const key = serializeValue((item as any)[field])
        if (!index.has(key)) index.set(key, new Set())
        index.get(key)?.add(item.id)
      })
    })
  }

  return createStorageAdapter<T, I>({
    setup: () => Promise.resolve(),
    teardown: () => Promise.resolve(),

    readAll: () => Promise.resolve([...items.values()]),
    readIds: ids => Promise.resolve(
      ids.map(id => items.get(id)).filter(item => item != null) as T[],
    ),

    createIndex: (field) => {
      indices.set(field, new Map())
      rebuild()
      return Promise.resolve()
    },
    dropIndex: (field) => {
      indices.delete(field)
      return Promise.resolve()
    },
    readIndex: (field) => {
      const index = indices.get(field)
      if (index == null) throw new Error(`No index on "${field}"`)
      return Promise.resolve(index)
    },

    insert: (newItems) => {
      newItems.forEach(item => items.set(item.id, item))
      rebuild()
      return Promise.resolve()
    },
    replace: (newItems) => {
      newItems.forEach(item => items.set(item.id, item))
      rebuild()
      return Promise.resolve()
    },
    remove: (oldItems) => {
      oldItems.forEach(item => items.delete(item.id))
      rebuild()
      return Promise.resolve()
    },
    removeAll: () => {
      items.clear()
      rebuild()
      return Promise.resolve()
    },
  })
}
```

Wire it up through a data adapter:

```ts
import { Collection, DefaultDataAdapter } from '@signaldb/core'

const dataAdapter = new DefaultDataAdapter({
  storage: () => createMemoryAdapter(),
})

const Posts = new Collection('posts', dataAdapter)
```

For a persistent backend, `@signaldb/localstorage` is the smallest real
implementation to read, and `@signaldb/generic-fs` shows the shape for anything
file-like.
