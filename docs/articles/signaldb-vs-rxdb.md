---
title: 'SignalDB vs RxDB: Differences, Code and When to Use Which'
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/signaldb-vs-rxdb/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/signaldb-vs-rxdb/
- - meta
  - name: og:title
    content: 'SignalDB vs RxDB: Differences, Code and When to Use Which'
- - meta
  - name: og:description
    content: A detailed comparison of SignalDB and RxDB, two local-first JavaScript databases. Reactivity, schemas, storage, sync, licensing and code side by side.
- - meta
  - name: description
    content: A detailed comparison of SignalDB and RxDB, two local-first JavaScript databases. Reactivity, schemas, storage, sync, licensing and code side by side.
- - meta
  - name: keywords
    content: signaldb vs rxdb, rxdb vs signaldb, rxdb alternative, rxdb alternatives, rxdb comparison, local-first database, offline-first database, javascript database, signals, RxJS
---
# SignalDB vs RxDB

SignalDB and RxDB are both local-first JavaScript databases: data lives on the client, queries run locally, and changes are synced with a backend. They differ in philosophy. **RxDB is a feature-rich database** with schemas, many storages and a replication engine with ready-made plugins. **SignalDB is a lightweight, signal-native data layer** that plugs into the reactivity of your framework and syncs with any backend through two functions.

::: info About this comparison
This page is written by the SignalDB maintainers. Information about RxDB was checked against the [RxDB documentation](https://rxdb.info/) (October 2026). If something is outdated, please [open an issue](https://github.com/maxnowack/signaldb/issues/new). For a comparison with more databases, see the [JavaScript database comparison](/comparison/).
:::

## Overview

| | SignalDB | RxDB |
|---|---|---|
| **Reactivity** | Signals of your framework via adapters (Angular, Solid, Vue, Preact, Svelte, MobX, …) | RxJS observables; custom reactivity factory for signals |
| **Data model** | Schema-less document collections; optional validation via a `validate` event | Document collections with a required JSON Schema |
| **Queries** | MongoDB-like selectors (powered by [mingo](https://github.com/kofrasa/mingo)), sort, projection, skip, limit | Mango (MongoDB-like) queries with indexes |
| **Where queries run** | Against in-memory collections (synchronous) by default; against storage or in a web worker with other data adapters | Through the storage's query engine (asynchronous) |
| **Storage** | IndexedDB, OPFS, localStorage, file system; custom adapters | Many storages; IndexedDB (via Dexie.js) and memory are free, OPFS, SQLite and file system storages are in paid tiers |
| **Sync** | Built-in sync engine; you implement `pull` and `push` for your API | Replication engine with plugins (HTTP, GraphQL, WebSocket, CouchDB, Firestore, MongoDB, WebRTC, …) |
| **Conflicts** | Local changes are replayed on the latest server data; last change wins | Customizable conflict handler per collection |
| **Schema migrations** | Not needed (schema-less) | Built-in migration strategies per schema version |
| **Extras** | ORM-style relations, indexes, devtools (beta) | Attachments, encryption, key compression, leader election, CRDT plugin, full-text and vector search, and more |
| **Platforms** | Browser, Node.js; React Native planned for v2 | Browser, Node.js, Electron, Capacitor, React Native, Expo, Tauri, Deno |
| **License** | MIT, all packages free | Apache 2.0 core; paid Pro tiers for premium storages and plugins. The open-source version allows up to 13 open collections in parallel |

## Code Side by Side

The same task in both databases: a persisted todo collection, a reactive list of open todos, and an insert.

**SignalDB** (here with Preact Signals; other frameworks use their own adapter):

```js
import { effect } from '@preact/signals-core'
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import preactReactivityAdapter from '@signaldb/preact'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 1,
    schema: { todos: ['completed'] },
  }),
})

const todos = new Collection('todos', dataAdapter, {
  reactivity: preactReactivityAdapter,
})

effect(() => {
  const cursor = todos.find({ completed: false })
  render(cursor.fetch())
  return () => cursor.cleanup()
})

await todos.insert({ title: 'Buy milk', completed: false })
```

**RxDB** (with the free Dexie.js-based IndexedDB storage):

```js
import { createRxDatabase } from 'rxdb'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'

const db = await createRxDatabase({ name: 'app', storage: getRxStorageDexie() })

await db.addCollections({
  todos: {
    schema: {
      version: 0,
      primaryKey: 'id',
      type: 'object',
      properties: {
        id: { type: 'string', maxLength: 100 },
        title: { type: 'string' },
        completed: { type: 'boolean' },
      },
      required: ['id', 'title', 'completed'],
    },
  },
})

db.todos.find({ selector: { completed: false } }).$.subscribe(render)

await db.todos.insert({ id: crypto.randomUUID(), title: 'Buy milk', completed: false })
```

The difference in style is typical: RxDB asks you to define a schema up front and gives you observables; SignalDB starts schema-less and lets your framework's effects track the query.

## Reactivity: Signals vs. Observables

RxDB is built on RxJS. Every query exposes an observable (`.$`) that you subscribe to, and RxDB offers a custom reactivity factory to turn these observables into signals for Angular, Preact, Vue or other libraries.

SignalDB is built around signals from the start. You run a normal query inside an effect of your framework (`effect`, `createEffect`, `watchEffect`, `$effect`, `autorun`), and SignalDB registers the dependency through a small [reactivity adapter](/reactivity/). There is no subscription to manage in the component, and query results are plain arrays.

**In practice:** if your app already uses RxJS heavily, RxDB fits naturally. If your framework is signal-based (Angular Signals, Solid, Vue, Svelte 5, Preact), SignalDB feels native. See [JavaScript Signals Explained](/signals/) for background.

## Schemas and Validation

RxDB requires a JSON Schema for every collection. It uses the schema for indexes, validation, encryption of fields, key compression and versioned migrations. That adds structure and safety, but also upfront work and migration code when the shape of your data changes.

SignalDB is schema-less. You can add [validation](/schema-validation/) with any library (e.g. Zod) through the collection's `validate` event, and old documents keep working without migrations.

## Storage and Performance Model

With its default [data adapter](/data-adapters/), SignalDB loads each collection into memory and persists changes through a [storage adapter](/data-persistence/). Queries are synchronous and run on the in-memory data, which makes them very fast and allows ad-hoc filters on any field. The trade-off: all documents of a collection must fit into memory. This works well for typical per-user datasets (thousands to tens of thousands of documents). For larger datasets, the `AsyncDataAdapter` answers queries from storage instead of memory, and the `WorkerDataAdapter` moves the data layer into a web worker.

RxDB queries go through its storage layer. Depending on the storage, data is read from IndexedDB, OPFS or SQLite on demand, with indexes defined in the schema. This scales to larger datasets, and RxDB offers performance plugins (memory-mapped storage, sharding, workers) for demanding cases; several of those are part of the paid tiers.

## Sync and Backends

Both databases sync local changes with a backend, and neither requires a specific server.

- **RxDB** has a generic replication protocol plus ready-made plugins for HTTP, GraphQL, WebSocket, CouchDB, Firestore, MongoDB, WebRTC and others. If one of them matches your backend, you get sync with little code.
- **SignalDB** has one generic [sync engine](/sync/): you write a `pull` function (fetch data) and a `push` function (send changes), optionally a hook for live updates. That keeps sync close to your existing REST or GraphQL API and your server's validation logic. There are examples for [HTTP](https://signaldb.js.org/examples/replication-http/), [Supabase](https://signaldb.js.org/examples/supabase/), [Firebase](https://signaldb.js.org/examples/firebase/) and [Appwrite](https://signaldb.js.org/examples/appwrite/).

## When to Choose RxDB

- You need **React Native, Capacitor, Electron or Tauri** support today.
- You want **ready-made replication** with CouchDB, Firestore, GraphQL or WebRTC.
- You need **large local datasets** that should not be held in memory.
- You need **encryption, attachments, schema migrations** or other advanced plugins.
- You want **commercial support** and are fine with paid tiers for premium features.

## When to Choose SignalDB

- You build a **web app** with a signal-based framework (Angular, Solid, Vue, Svelte, Preact) or React.
- You want **queries that integrate with your framework's reactivity** without RxJS.
- Your data per user **fits in memory** and you want fast, ad-hoc queries.
- You have **an existing backend** and want to keep full control over the sync logic.
- You want a **small, MIT-licensed** library without collection limits or paid tiers.

## Migrating from RxDB to SignalDB

Moving from RxDB to SignalDB mostly means:

1. Creating a SignalDB [collection](/reference/core/collection/) for each RxDB collection, with a [storage adapter](/data-persistence/) underneath its [data adapter](/data-adapters/).
2. Translating queries: RxDB's `{ selector: { … } }` becomes the selector itself in SignalDB's `find()`; `sort`, `skip` and `limit` move to the options object.
3. Replacing observable subscriptions (`.$.subscribe`) with queries inside your framework's effects.
4. Re-implementing replication as `pull` and `push` functions of the [`SyncManager`](/sync/).
5. Moving schema rules into a [`validate` handler](/schema-validation/) if you still need them.

## Frequently Asked Questions

### Is SignalDB a replacement for RxDB?

For web apps whose data fits in memory and that sync with their own backend, yes. For mobile apps, very large local datasets, or features like encryption and attachments, RxDB is the better fit today.

### Is RxDB free?

The RxDB core is open source under the Apache 2.0 license. Premium storages (such as OPFS and SQLite), performance plugins and the removal of the 13-collection limit are part of paid tiers.

### Does SignalDB use RxJS?

No. SignalDB integrates with the signal or reactivity library you already use through adapters, without RxJS.

### Which is faster, SignalDB or RxDB?

It depends on the workload. With its default data adapter, SignalDB queries in-memory data synchronously, which is very fast for datasets that fit in memory. RxDB with an indexed storage handles larger datasets without loading everything into memory. Benchmark with your own data and queries.
