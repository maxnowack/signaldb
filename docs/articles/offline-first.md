---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/offline-first/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/offline-first/
- - meta
  - name: og:title
    content: 'Offline-First Databases for JavaScript: How They Work and Which to Choose'
- - meta
  - name: og:description
    content: What an offline-first database is, how sync and conflict resolution work, and how SignalDB, RxDB, Dexie.js, PouchDB, WatermelonDB, TinyBase and TanStack DB compare.
- - meta
  - name: description
    content: What an offline-first database is, how sync and conflict resolution work, and how SignalDB, RxDB, Dexie.js, PouchDB, WatermelonDB, TinyBase and TanStack DB compare.
- - meta
  - name: keywords
    content: offline-first database, offline first database, offline database javascript, offline-first web app, local-first, IndexedDB, sync, conflict resolution, RxDB, Dexie.js, PouchDB, WatermelonDB, TinyBase, TanStack DB, SignalDB, Angular offline database
---
# Offline-First Databases for JavaScript

## Understanding the Offline-First Approach

**An offline-first app reads and writes data locally first and synchronizes with the server in the background.** The network becomes an optimization instead of a requirement: the app starts, shows data and accepts changes even without a connection, and reconciles with the backend once it is back online.

The core building block is an **offline-first database**: a database that runs inside the app (in the browser, in Electron or on a mobile device), persists data locally, and keeps a queue of local changes that it syncs with the server.

Offline-first matters well beyond "no internet". The same architecture makes apps feel instant on slow or flaky connections, because every interaction is answered from local data, and it makes [optimistic UI](/optimistic-ui/) the default rather than an extra feature.

This guide covers the challenges of offline-first development, how offline-first JavaScript databases work, how the popular options compare, and how to build an offline-first app step by step.

## Challenges in Implementing Offline-First Applications

Offline-first moves work from the server to the client. These are the problems you need to solve:

1. **Local persistence**: data has to survive reloads and app restarts. In the browser this means IndexedDB, OPFS or localStorage, each with different limits (see [data persistence](/data-persistence/)).
2. **Change tracking and sync**: every local insert, update and removal must be recorded and replayed against the server when the connection is back, in the right order.
3. **Conflict resolution**: if the same record was changed locally and on the server, the app needs a deterministic rule for which change wins.
4. **Reactivity**: when synced data arrives, every part of the UI that shows it must update without a reload.
5. **Asset caching**: the app shell (HTML, JavaScript, CSS) must be available offline too, which is the job of a Service Worker, not the database.

A good offline-first database handles points 1–4 for you; the Service Worker handles point 5.

## Overview of Reactive JavaScript Databases

Most modern offline-first databases for JavaScript are **reactive**: instead of running a query once, you subscribe to it, and the result updates automatically whenever the underlying data changes, whether through a local write or a sync from the server.

This is what makes offline-first practical. Without reactivity, every sync would require you to find and refresh every affected view by hand. With a reactive database, the UI is simply a function of the local data, and sync only needs to update that data.

## JavaScript Databases for Offline Applications

The table compares popular open-source databases you can use for offline-first JavaScript apps. It focuses on how each one stores data, how you get reactive query results, and how sync works.

| Database | Storage | Reactive queries | Sync | License | Good fit for |
|---|---|---|---|---|---|
| **[SignalDB](/getting-started/)** | In-memory collections, persisted via adapters (IndexedDB, OPFS, localStorage, file system) | MongoDB-like queries, reactive through the signal library you use (Solid, Angular, Vue, Preact, Svelte, MobX, …) | Built-in sync layer: you implement `pull`/`push` for any backend (REST, GraphQL, WebSockets) | MIT | Reactive web apps that need optimistic UI and sync with an existing backend |
| **[RxDB](https://rxdb.info/)** | Pluggable storages (IndexedDB, OPFS, SQLite and more; some are paid premium plugins) | Mango (MongoDB-style) queries as RxJS observables | Replication plugins for many backends (HTTP, GraphQL, CouchDB, Firestore, Supabase, …) | Apache 2.0 core, paid premium plugins | Feature-rich offline-first apps across browser, Electron and React Native |
| **[Dexie.js](https://dexie.org/)** | IndexedDB wrapper | `liveQuery()` | Via the Dexie Cloud service or your own code | Apache 2.0 | Web apps that want a convenient API directly on top of IndexedDB |
| **[PouchDB](https://pouchdb.com/)** | IndexedDB (browser), LevelDB (Node.js) | Changes feed | Built-in two-way sync with CouchDB-compatible servers | Apache 2.0 | Apps with a CouchDB-compatible backend |
| **[WatermelonDB](https://watermelondb.dev/)** | SQLite on React Native, LokiJS adapter on the web | Observable queries | Sync protocol you implement on your backend | MIT | React Native apps with large datasets |
| **[TinyBase](https://tinybase.org/)** | In-memory store of tables and values, persisted via persisters (IndexedDB, localStorage, SQLite, …) | Listeners and React hooks | Synchronizers based on CRDTs | MIT | Small to medium reactive app state with peer or server sync |
| **[TanStack DB](https://tanstack.com/db)** | In-memory collections | Live queries with optimistic mutations | Via collection types (TanStack Query, ElectricSQL and others) | MIT | Apps already using TanStack Query |

*Last reviewed: October 2026. Features change quickly. Check each project's documentation before you decide. For a detailed feature matrix and a one-to-one comparison with each project, see the [JavaScript database comparison](/comparison/).*

### Factors to Consider When Choosing a Database

- **Backend**: do you already have a REST or GraphQL API? Then you need a database whose sync can talk to *your* API (SignalDB, RxDB). If you can choose the backend, a database with a matching server (PouchDB with CouchDB, a hosted sync service) can save work.
- **Framework**: check how query results reach your components. SignalDB plugs into the framework's own signals; RxDB uses RxJS observables; Dexie and TinyBase ship React hooks.
- **Platform**: browser only, or also React Native and Electron? Storage options differ per platform.
- **Data size**: in-memory databases (SignalDB, TinyBase, TanStack DB) are extremely fast for typical app data, but every record lives in memory. For hundreds of thousands of records, a database that queries storage directly (Dexie, WatermelonDB, RxDB with an indexed storage) is a better fit.
- **License and cost**: all options above are open source, but some features (RxDB premium plugins, Dexie Cloud) are commercial.

## SignalDB: A Case Study in Offline-First Applications

SignalDB is a reactive, local-first JavaScript database. Here is how it handles the challenges listed above.

**1. Local persistence.** Every collection can be persisted with a [persistence adapter](/data-persistence/). Data is loaded into memory on start and written back on every change:

```js
import { Collection } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const todos = new Collection({
  persistence: createIndexedDBAdapter('todos'),
})

todos.insert({ title: 'Buy milk', completed: false }) // works offline
```

**2. Change tracking and sync.** The [`SyncManager`](/reference/sync/) records every local change, persists the change queue (so it survives reloads while offline), and calls your `pull` and `push` functions when it syncs:

```js
import { SyncManager } from '@signaldb/sync'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const syncManager = new SyncManager({
  persistenceAdapter: name => createIndexedDBAdapter(name),
  pull: async ({ apiPath }) => {
    const items = await fetch(apiPath).then(res => res.json())
    return { items }
  },
  push: async ({ apiPath }, { changes }) => {
    await fetch(apiPath, { method: 'POST', body: JSON.stringify(changes) })
  },
})

syncManager.addCollection(todos, { name: 'todos', apiPath: '/api/todos' })
syncManager.syncAll()
```

**3. Conflict resolution.** During sync, SignalDB pulls the latest server data and *replays* the local changes on top of it. Only the resulting differences are pushed, and the most recent change operation wins. See [Sync Flow & Conflict Resolution](/sync/#sync-flow-conflict-resolution) for details.

**4. Reactivity.** Queries run inside an effect of your signal library are reactive, so data from a sync shows up in the UI immediately (see the framework examples below).

Because it is backend-agnostic, SignalDB fits apps that already have an API. There are examples for a [plain HTTP API](https://signaldb.js.org/examples/replication-http/), [Firebase](https://signaldb.js.org/examples/firebase/), [Supabase](https://signaldb.js.org/examples/supabase/) and [Appwrite](https://signaldb.js.org/examples/appwrite/).

## Offline-First in Angular, React and Vue

The database layer is the same in every framework. Only the way query results reach your components differs.

**Angular** uses Angular Signals through [`@signaldb/angular`](/reference/angular/):

```ts
import { effect } from '@angular/core'
import { Collection } from '@signaldb/core'
import angularReactivityAdapter from '@signaldb/angular'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const todos = new Collection({
  reactivity: angularReactivityAdapter,
  persistence: createIndexedDBAdapter('todos'),
})

effect((onCleanup) => {
  const cursor = todos.find({ completed: false })
  console.log(cursor.fetch()) // re-runs on local writes and synced changes
  onCleanup(() => cursor.cleanup())
})
```

**React** uses the `useReactivity` hook from [`@signaldb/react`](/guides/react/):

```jsx
const openTodos = useReactivity(() => todos.find({ completed: false }).fetch())
```

**Vue** uses Vue's refs through [`@signaldb/vue`](/reference/vue/):

```js
watchEffect((onCleanup) => {
  const cursor = todos.find({ completed: false })
  openTodos.value = cursor.fetch()
  onCleanup(() => cursor.cleanup())
})
```

Full setup instructions are in the guides for [Angular](/guides/angular/), [React](/guides/react/), [Vue](/guides/vue/), [Svelte](/guides/svelte/) and [Solid](/guides/solid-js/).

## Building Offline-First JavaScript Apps

### Step 1: Understand Offline-First Needs
- Identify the data and features users need offline. Not everything has to be available offline.
- Plan for users switching between online and offline often, and for long offline periods.

### Step 2: Choose the Right Tools
- Pick an offline-first database that matches your backend and framework (see the [comparison](#javascript-databases-for-offline-applications)).
- Add a **Service Worker** (for example with Workbox) so the app shell loads offline.

### Step 3: Implement Effective Caching
- Cache static assets (HTML, CSS, JavaScript) with a **cache-first** strategy.
- Keep *data* in the database, not in the HTTP cache. That way it stays queryable and writable offline.

### Step 4: Handle Data Synchronization
- Queue local changes and push them when the app reconnects. A sync layer such as SignalDB's [`SyncManager`](/sync/) does this for you.
- Use live updates (WebSockets or server-sent events) to pull remote changes as soon as they happen.

### Step 5: Test Rigorously
- Test the first load without a connection, a disconnect in the middle of a write, and conflicting edits on two devices.
- Use the browser devtools' offline mode and network throttling.

### Step 6: Optimize User Experience
- Show offline status and pending sync state. SignalDB exposes a reactive `isSyncing()` for this.
- Never block the UI on the network: write locally, sync in the background.

## Enhanced User Experience (UX) with Reactive Databases

Reactive offline-first databases improve UX in three ways:

- **Instant feedback**: every action is applied locally first, so there are no loading spinners for writes ([optimistic UI](/optimistic-ui/)).
- **Seamless transitions**: going offline or coming back online does not interrupt the user. Sync happens in the background.
- **Always up to date**: when synced data arrives, reactive queries update the affected views automatically.

To get the most out of this, show a clear offline indicator, communicate pending changes ("3 changes waiting to sync"), and explain conflicts in plain language when they need the user's attention.

## Best Practices and Tips for Offline-First Development

### Best Practices for Offline-First Development

1. **Design for offline from the start.** Retrofitting offline support into an app that assumes the server is always reachable is much harder.
2. **Keep the local dataset focused.** Sync only what the current user needs offline, for example their own projects instead of the whole database.
3. **Make writes idempotent on the server.** Sync may retry a push; the server should handle the same change twice without side effects.
4. **Choose a clear conflict strategy.** "Last write wins" is simple and fits most apps. Collaborative editing of the same text needs specialised approaches such as CRDTs.
5. **Persist the sync queue.** Changes made offline must survive a reload or app restart before they are pushed.

### Common Pitfalls to Avoid
- Storing data only in memory or in the HTTP cache: it disappears on reload or cannot be queried offline.
- Ignoring storage limits: browsers can evict data under storage pressure. Request persistent storage (`navigator.storage.persist()`) for important data.
- Silent conflicts: if your conflict rule can discard user input, make it visible.

## Frequently Asked Questions

### What is an offline-first database?

A database that runs inside the client application, stores data locally and synchronizes with a server in the background, so the app keeps working without a network connection.

### What is the difference between offline-first and local-first?

Offline-first means the app keeps working without a network. Local-first goes further: the local copy is the primary copy of the data, and the server is mainly used for sync, backup and collaboration. An offline-first database is the technical foundation for both.

### Which JavaScript database works offline?

All databases in the [comparison above](#javascript-databases-for-offline-applications) work offline. They differ in storage, reactivity and how they sync with your backend.

### Do I need a Service Worker for an offline-first app?

For a web app, yes, if it should *load* without a connection: the Service Worker caches the app's files. The offline-first database handles the *data*.

## Conclusion

Offline-first apps answer every interaction from local data and sync in the background, which makes them faster and more resilient than apps that depend on the network. The key decision is the database: it has to persist data locally, track and sync changes, resolve conflicts and keep the UI reactive.

If you are building a reactive web app with an existing backend, [get started with SignalDB](/getting-started/). It persists data locally, syncs with any API and plugs into the signals of your framework.
