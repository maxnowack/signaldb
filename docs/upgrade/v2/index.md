---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/upgrade/v2/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/upgrade/v2/
- - meta
  - name: og:title
    content: Upgrade to v2 | SignalDB
- - meta
  - name: og:description
    content: Learn how to upgrade your project to SignalDB v2. This guide summarizes breaking changes and shows practical migration steps.
- - meta
  - name: description
    content: Learn how to upgrade your project to SignalDB v2. This guide summarizes breaking changes and shows practical migration steps.
- - meta
  - name: keywords
    content: SignalDB, upgrade, v2, version 2, migration, breaking changes, DataAdapter, StorageAdapter, indices, AutoFetch, guide
---
# Upgrade to v2

This guide explains what changed in SignalDB v2 and how to migrate your application safely. It focuses on API changes, the new DataAdapter/StorageAdapter split, and practical before/after examples.

## Summary of Breaking Changes

- CRUD methods on `Collection` are async now.
  - `insert`, `insertMany`, `updateOne`, `updateMany`, `replaceOne`, `removeOne`, `removeMany` return Promises.
  - They resolve to what they returned synchronously in v1: the new ID(s) or the number of affected items (see examples below).
- Indices are configured as simple field names: `indices: string[]`.
- Persistence was renamed and redesigned:
  - `PersistenceAdapter` → `StorageAdapter` (new API shape).
  - `createPersistenceAdapter` → `createStorageAdapter`.
  - `combinePersistenceAdapters` was removed.
- The storage adapters shipped with SignalDB changed their configuration and their storage layout. **Data written by v1 is not read by v2** — see [Storage adapters: your existing data](#storage-adapters-your-existing-data).
- `AutoFetchCollection` was removed. Use `AutoFetchDataAdapter` instead.
- Persistence events on `Collection` were removed. Each has a different replacement — see [Event Changes](#event-changes).
- `createMemoryAdapter` and the `memory` option were removed.
- `Collection#resetData()` was removed without replacement. To reload a collection from storage, dispose it and create it again.
- Readiness API changed: `.isReady()` (promise) was renamed to `.ready()`. A new reactive `.isReady()` getter was added.
- `isLoading()` on the `Collection` no longer describes the initial load. It starts out `false` and is `true` only while an `{ async: true }` query or a write is running. Use `ready()` / `isReady()` for the initial load and `Cursor#isLoading()` for a single query.
- Collection constructor: prefer `new Collection(name, dataAdapter, options?)`; deprecated `persistence` option is still accepted and wrapped by `DefaultDataAdapter`.
- `SyncManager`: the `persistenceAdapter` option was removed. Use `dataAdapter` instead.
- `StorageAdapter.readIndex` now declares `Map<string | null, Set<I>>` instead of `Map<any, Set<I>>`. Only relevant if you wrote your own adapter — see [Custom storage adapters](#custom-storage-adapters-index-keys) below.
- Observer semantics changed in two ways — see [Observer events](#observer-events) below.

## Core CRUD API (async)

All write operations are asynchronous. Update your call sites to `await` them and adapt to the new return values.

Before (v1):
```ts
const id = Posts.insert({ title: 'Hello' })
Posts.updateOne({ id }, { $set: { title: 'Hi' } })
Posts.removeOne({ id })
```

After (v2):
```ts
const id = await Posts.insert({ title: 'Hello' }) // returns the inserted ID
await Posts.updateOne({ id }, { $set: { title: 'Hi' } }) // resolves to number of updated items
await Posts.removeOne({ id }) // resolves to number of removed items
```

Return values in v2:
- `insert(item)` → `Promise<I>` (inserted ID)
- `insertMany(items)` → `Promise<I[]>` (inserted IDs)
- `updateOne(...)` → `Promise<number>` (0 or 1)
- `updateMany(...)` → `Promise<number>`
- `replaceOne(...)` → `Promise<number>` (0 or 1)
- `removeOne(...)` → `Promise<number>` (0 or 1)
- `removeMany(...)` → `Promise<number>`

## Readiness and Loading

- Promise-based readiness: `await collection.ready()` replaces `await collection.isReady()`. It resolves once the storage adapter is set up and its data has been loaded.
- Reactive readiness: `collection.isReady()` now returns a reactive boolean that turns `true` at the same moment.
- Loading states of a single query: [`cursor.isLoading()`](/reference/core/cursor/#⚡️-isloading-reactive) is reactive and `true` until the query has been answered. Use it to tell a query that has not been answered yet from one that legitimately matched nothing — both return an empty list.
- Activity of the collection as a whole:
  - `collection.isPulling()` is a reactive boolean that is `true` while a `find(…, { async: true })` query is running. It does not reflect the initial load from storage or a sync pull.
  - `collection.isPushing()` is a reactive boolean that is `true` while a write is running.
  - `collection.isLoading()` is reactive and `true` if either of the two is. It starts as `false`.

Before (v1):
```ts
await collection.isReady()
```

After (v2):
```ts
await collection.ready()
// reactive checks (in a reactive context)
collection.isReady() // initial load finished
collection.find({ published: true }).isLoading() // this query not answered yet
```

## Indices Configuration

Indices are now defined by field names directly.

Before (v1):
```ts
import { createIndex } from '@signaldb/core'

const Posts = new Collection({
  indices: [
    createIndex('title'),
    createIndex('author.id'),
  ],
})
```

After (v2):
```ts
const Posts = new Collection({
  indices: ['title', 'author.id'],
})
```

Remove any usages of `createIndex` and `createIndexProvider`. Use string field paths instead (dot-notation supported).

## Storage vs. Persistence

The persistence layer has been renamed to Storage and modernized.

- `PersistenceAdapter` → `StorageAdapter` (new API).
- `createPersistenceAdapter` → `createStorageAdapter`.
- `combinePersistenceAdapters` was removed.
- Persistence-related `Collection` events were removed. See [Event Changes](#event-changes) for what replaces each of them.

New `StorageAdapter` API surface:
```ts
interface StorageAdapter<T extends { id: I }, I> {
  // lifecycle
  setup(): Promise<void>
  teardown(): Promise<void>

  // reads
  readAll(): Promise<T[]>
  readIds(ids: I[]): Promise<T[]>
  query?(query: StorageQuery<T>): Promise<StorageQueryAnswer<T>> // optional

  // indices
  createIndex(field: string): Promise<void>
  dropIndex(field: string): Promise<void>
  readIndex(field: string): Promise<Map<string | null, Set<I>>>

  // writes
  insert(items: T[]): Promise<void>
  replace(items: T[]): Promise<void>
  remove(items: T[]): Promise<void>
  removeAll(): Promise<void>
}
```

Migration tips from old `PersistenceAdapter`:
- Move one-time initialization into `setup()`, cleanup into `teardown()`.
- Replace “load everything” with `readAll()`; selective lookups go through `readIds()`.
- Replace “save/patch” with explicit `insert`, `replace`, `remove`, and `removeAll` operations.
- Provide index operations (`createIndex`, `dropIndex`, `readIndex`) if your storage can accelerate queries (dot-notation field names are passed in).

Minimal in-memory example for testing:
```ts
import { createStorageAdapter } from '@signaldb/core'

type Item = { id: string; [k: string]: any }

export const memoryStorage = () => {
  let items: Item[] = []

  return createStorageAdapter<Item, string>({
    async setup() {},
    async teardown() {},
    async readAll() { return items },
    async readIds(ids) { return items.filter(i => ids.includes(i.id)) },
    async createIndex(field) { /* no-op for memory */ },
    async dropIndex(field) { /* no-op */ },
    async readIndex(field) { return new Map() },
    async insert(newItems) { items = [...items, ...newItems] },
    async replace(newItems) {
      const byId = new Map(items.map(i => [i.id, i]))
      for (const it of newItems) byId.set(it.id, it)
      items = [...byId.values()]
    },
    async remove(toRemove) {
      const ids = new Set(toRemove.map(i => i.id))
      items = items.filter(i => !ids.has(i.id))
    },
    async removeAll() { items = [] },
  })
}
```

Note: For simple upgrades, you can still pass the deprecated `persistence` option to the `Collection` constructor; v2 wraps it with `DefaultDataAdapter`. Prefer the explicit DataAdapter + StorageAdapter setup for new code.

## Storage adapters: your existing data

Every storage adapter shipped with SignalDB changed how it is configured and
where it keeps its data, and none of them requires a `@signaldb/core` older
than 2.0.0 anymore. **v2 does not read what v1 wrote.** The old data is left
untouched, so nothing is lost, but a collection starts out empty after the
upgrade until you migrate it once.

| Package | v1 | v2 |
| --- | --- | --- |
| `@signaldb/localstorage` | key `signaldb-collection-<name>` | key `<databaseName>-<name>` (default `signaldb-<name>`), plus one key per declared index |
| `@signaldb/indexeddb` | `createIndexedDBAdapter('posts')` — one database per collection (`signaldb-posts`, store `items`) | `createIndexedDBAdapter({ databaseName, version, schema, onUpgrade? })` — one database for all collections, returns the `storage` function for a data adapter |
| `@signaldb/fs` | `createFileSystemAdapter('posts.json')` — one JSON file per collection | `createFilesystemAdapter('./data/posts')` — a folder with one file per document under `items/` and one file per indexed value under `index/` |
| `@signaldb/opfs` | `createOPFSAdapter('posts.json')` — one file per collection | `createOPFSAdapter('posts')` — a folder, laid out like `@signaldb/fs` |
| `@signaldb/generic-fs` | one file per collection | a folder, laid out like `@signaldb/fs`; a custom `Driver` has to be rewritten against the new interface (path building, directory creation, recursive listing) |

With `@signaldb/indexeddb`, the `schema` is the complete description of the
database: a store that exists but is missing from `schema` is dropped on
upgrade. List every collection you use — and, if you pass the same data adapter
to the `SyncManager`, its stores as well.

### Migrating the data once

Read the v1 data yourself, insert it into the v2 collection, then remove the old
copy. For `@signaldb/localstorage`:

```ts
await Posts.ready()

const legacyKey = 'signaldb-collection-posts'
const legacyData = localStorage.getItem(legacyKey)
if (legacyData != null) {
  await Posts.insertMany(JSON.parse(legacyData))
  localStorage.removeItem(legacyKey)
}
```

If you configured a custom `serialize`/`deserialize` in v1, use your
`deserialize` instead of `JSON.parse`.

For `@signaldb/indexeddb`, the v1 data is in the database `signaldb-<name>`
(or `<prefix><name>` if you set `prefix`), in the object store `items`:

```ts
/**
 * Reads every item a v1 IndexedDB adapter stored for a collection.
 * @param name - The name the v1 adapter was created with.
 * @returns The stored items.
 */
function readLegacyItems(name: string) {
  return new Promise<any[]>((resolve, reject) => {
    const request = indexedDB.open(`signaldb-${name}`)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const database = request.result
      if (!database.objectStoreNames.contains('items')) {
        database.close()
        resolve([])
        return
      }
      const getAll = database.transaction('items').objectStore('items').getAll()
      getAll.onerror = () => reject(getAll.error)
      getAll.onsuccess = () => {
        database.close()
        resolve(getAll.result)
      }
    }
  })
}

await Posts.ready()
const legacyItems = await readLegacyItems('posts')
if (legacyItems.length > 0) await Posts.insertMany(legacyItems)
indexedDB.deleteDatabase('signaldb-posts')
```

For `@signaldb/fs`, `@signaldb/opfs` and `@signaldb/generic-fs`, point the v2
adapter at a new folder, read the old JSON file once, `insertMany` its contents
and delete the file afterwards.

## New DataAdapter Layer

v2 introduces a `DataAdapter` abstraction to separate collection behavior from storage mechanics and to enable advanced scenarios. See the [Data Adapters](/data-adapters/) chapter for the full picture.

- [`DefaultDataAdapter`](/reference/core/defaultdataadapter/): simple, standard choice that works with a `StorageAdapter`.
- [`AsyncDataAdapter`](/reference/core/asyncdataadapter/): async-first flow with explicit storage setup.
- [`WorkerDataAdapter` / `WorkerDataAdapterHost`](/reference/core/workerdataadapter/): run data operations in a Web Worker.
- [`AutoFetchDataAdapter`](/reference/core/autofetchdataadapter/): replacement for `AutoFetchCollection` (if you previously relied on it).

Standard setup with `DefaultDataAdapter` (recommended baseline):
```ts
import { Collection, DefaultDataAdapter } from '@signaldb/core'

const dataAdapter = new DefaultDataAdapter({
  storage: (name) => myStorageFor(name), // returns a StorageAdapter for the given collection name
})

const Posts = new Collection('posts', dataAdapter, {
  indices: ['id', 'authorId', 'createdAt'],
})
```

If you previously used `AutoFetchCollection`, migrate to `AutoFetchDataAdapter`. Keep the same `Collection` constructor pattern shown above but swap the adapter class.

## Collection Constructor Changes

The `Collection` constructor now supports two forms:
- `new Collection(options?)` (legacy-compatible). The deprecated `persistence` option still works and is wrapped by `DefaultDataAdapter`.
- `new Collection(name, dataAdapter, options?)` (recommended): pass a collection name and a `DataAdapter` instance explicitly.

Example migrating from v1:
Before (v1):
```ts
const Posts = new Collection({
  name: 'posts',
  persistence: /* old adapter */
})
```
After (v2):
```ts
import { DefaultDataAdapter } from '@signaldb/core'

const dataAdapter = new DefaultDataAdapter({
  storage: (name) => myStorageFor(name),
})

const Posts = new Collection('posts', dataAdapter, {
  indices: ['title']
})
```

## Removed Memory Adapter

`createMemoryAdapter` and the `memory` option were removed. For tests or ephemeral storage, implement a trivial in-memory `StorageAdapter` with `createStorageAdapter` that keeps items in a local array or Map.

## Event Changes

All persistence-level events on `Collection` were removed. They described one
adapter loading and saving one collection as a whole, which is no longer how
data moves. Replace them by what you used them for:

| v1 event | v2 replacement |
| --- | --- |
| `persistence.init` | `await collection.ready()`, or the reactive `collection.isReady()` |
| `persistence.pullStarted` / `persistence.pullCompleted` (initial load) | `collection.ready()` / `collection.isReady()` for the collection, [`cursor.isLoading()`](/reference/core/cursor/#⚡️-isloading-reactive) for a single query |
| `persistence.pushStarted` / `persistence.pushCompleted` / `persistence.transmitted` | Await the write — with the `DefaultDataAdapter` it resolves once the storage adapter has written it. `collection.isPushing()` reflects running writes reactively. |
| `persistence.error` | A failed write rejects its promise. A failure outside of a write — while setting up the storage adapter and loading its data, for instance — goes to the `onError` option of the data adapter ([`DefaultDataAdapter`](/reference/core/defaultdataadapter/), [`AsyncDataAdapter`](/reference/core/asyncdataadapter/), [`AutoFetchDataAdapter`](/reference/core/autofetchdataadapter/)); without it, it is only logged with `console.error`. |
| `persistence.received` | No equivalent. A `StorageAdapter` is not notified of changes made outside the collection; changes from a server reach the collection through [`SyncManager`](/sync/) or the `AutoFetchDataAdapter`. |

`collection.isPulling()` is not a replacement for the pull events: it is only
`true` while a `find(…, { async: true })` query is running.

Existing CRUD events remain: `added`, `changed`, `removed` and their corresponding action events (`insert`, `updateOne`, `updateMany`, `replaceOne`, `removeOne`, `removeMany`).

A query that fails now announces itself through the new `query.error` event.
This matters more than it looks: a cursor whose query failed keeps returning its
neutral empty result, which is indistinguishable from a query that legitimately
matched nothing. If your application needs to tell the two apart, listen here.

## Observer events

Two changes to what `observeChanges` reports. Neither changes the data you end
up with — both change how many events you are told about.

**`movedBefore` reports the minimal set of moves.** In v1, every item whose
neighbouring item had changed was reported as moved, so moving a single item
could produce a `movedBefore` for several of them. Applying the reported moves
still produces the same order. Consumers that count `movedBefore` calls, or that
rely on being notified about items which did not themselves move, will now see
fewer events.

**`changed` is no longer emitted for a write that matched nothing.** It
previously was, whenever the item had still existed at the moment it was read
back.

## Custom storage adapters: index keys

`StorageAdapter.readIndex` now declares `Map<string | null, Set<I>>` rather than
`Map<any, Set<I>>`. The keys always had to be `serializeValue(value)` — that is
what SignalDB looks an index up with — but the type did not say so, and an
adapter keying its index by the raw field value answered nothing for every
non-string field and everything for a `$ne` on one.

If your adapter stores raw keys, wrap them:

```ts
import { serializeValue } from '@signaldb/core'

const key = serializeValue(item[field])
```

Only string-valued fields were unaffected, which is why this can go unnoticed
until someone indexes a number or a boolean.

## SyncManager

The `persistenceAdapter` option was removed. Pass a `dataAdapter` instead — the
same one your collections use:

```js
const syncManager = new SyncManager({
  dataAdapter,
  // …
})
```

`@signaldb/sync` v2 requires `@signaldb/core` 2.0.0 or later.

## Migration Checklist

- Update all write calls to `await` the new async methods and handle new return values.
- Replace index providers with `indices: string[]`.
- Rename persistence APIs to storage (`createStorageAdapter`, `StorageAdapter`), remove `combinePersistenceAdapters`.
- Replace `AutoFetchCollection` with `AutoFetchDataAdapter`.
- Switch `await collection.isReady()` to `await collection.ready()` and use reactive `collection.isReady()` where needed.
- Check any code that used `collection.isLoading()` to wait for the initial load; use `ready()` / `isReady()` or `cursor.isLoading()` instead.
- Replace persistence events as described in [Event Changes](#event-changes) — `ready()`, `cursor.isLoading()`, awaited writes and the data adapter's `onError` — and consider listening for `query.error`.
- Migrate the data your v1 storage adapters wrote; v2 does not read it (see [Storage adapters: your existing data](#storage-adapters-your-existing-data)).
- Remove `createMemoryAdapter` and the `memory` option; implement an in-memory `StorageAdapter` if necessary.
- Remove calls to `resetData()`.
- Replace the `SyncManager`'s `persistenceAdapter` option with `dataAdapter`.
- In a custom `StorageAdapter`, key `readIndex` by `serializeValue(value)`.
- Review anything counting `movedBefore` events or relying on `changed` for a write that matched nothing.

If you run into something not covered here, see the changelog for `@signaldb/core` and the API reference, or open a discussion/issue.
