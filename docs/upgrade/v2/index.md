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
  - Return values changed to explicit IDs or counts (see examples below).
- Indices are configured as simple field names: `indices: string[]`.
- Persistence was renamed and redesigned:
  - `PersistenceAdapter` → `StorageAdapter` (new API shape).
  - `createPersistenceAdapter` → `createStorageAdapter`.
  - `combinePersistenceAdapters` was removed.
- `AutoFetchCollection` was removed. Use `AutoFetchDataAdapter` instead.
- Persistence events on `Collection` were removed. Use `isPulling()` / `isPushing()` / `isLoading()` reactive helpers.
- `createMemoryAdapter` and the `memory` option were removed.
- Readiness API changed: `.isReady()` (promise) was renamed to `.ready()`. A new reactive `.isReady()` getter was added.
- Collection constructor: prefer `new Collection(name, dataAdapter, options?)`; deprecated `persistence` option is still accepted and wrapped by `DefaultDataAdapter`.

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

- Promise-based readiness: `await collection.ready()` replaces `await collection.isReady()`.
- Reactive readiness: `collection.isReady()` now returns a reactive boolean.
- Loading states:
  - `collection.isPulling()` and `collection.isPushing()` are reactive booleans.
  - `collection.isLoading()` is reactive and true if pulling or pushing. It starts as `false` by default.

Before (v1):
```ts
await collection.isReady()
```

After (v2):
```ts
await collection.ready()
// reactive checks (in a reactive context)
collection.isReady()
collection.isLoading() // or isPulling()/isPushing()
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
- Persistence-related `Collection` events were removed. Use loading helpers (`isPulling`/`isPushing`/`isLoading`) when you need UI feedback.

New `StorageAdapter` API surface:
```ts
interface StorageAdapter<T extends { id: I }, I> {
  // lifecycle
  setup(): Promise<void>
  teardown(): Promise<void>

  // reads
  readAll(): Promise<T[]>
  readIds(ids: I[]): Promise<T[]>

  // indices
  createIndex(field: string): Promise<void>
  dropIndex(field: string): Promise<void>
  readIndex(field: string): Promise<Map<any, Set<I>>>

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

## New DataAdapter Layer

v2 introduces a `DataAdapter` abstraction to separate collection behavior from storage mechanics and to enable advanced scenarios.

- `DefaultDataAdapter`: simple, standard choice that works with a `StorageAdapter`.
- `AsyncDataAdapter`: async-first flow with explicit storage setup.
- `WorkerDataAdapter` / `WorkerDataAdapterHost`: run data operations in a Web Worker.
- `AutoFetchDataAdapter`: replacement for `AutoFetchCollection` (if you previously relied on it).

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

All persistence-level events on `Collection` were removed. Use these instead:
- `collection.isPulling()` / `collection.isPushing()` / `collection.isLoading()` (reactive)
- Existing CRUD events remain: `added`, `changed`, `removed` and their corresponding action events (`insert`, `updateOne`, `updateMany`, `replaceOne`, `removeOne`, `removeMany`).

## Migration Checklist

- Update all write calls to `await` the new async methods and handle new return values.
- Replace index providers with `indices: string[]`.
- Rename persistence APIs to storage (`createStorageAdapter`, `StorageAdapter`), remove `combinePersistenceAdapters`.
- Replace `AutoFetchCollection` with `AutoFetchDataAdapter`.
- Switch `await collection.isReady()` to `await collection.ready()` and use reactive `collection.isReady()` where needed.
- Replace persistence events with `isPulling`/`isPushing`/`isLoading`.
- Remove `createMemoryAdapter` and the `memory` option; implement an in-memory `StorageAdapter` if necessary.

If you run into something not covered here, see the changelog for `@signaldb/core` and the API reference, or open a discussion/issue.
