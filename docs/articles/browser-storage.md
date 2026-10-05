---
title: 'localStorage vs IndexedDB vs OPFS: Browser Storage Compared'
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/browser-storage/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/browser-storage/
- - meta
  - name: og:title
    content: 'localStorage vs IndexedDB vs OPFS: Browser Storage Compared'
- - meta
  - name: og:description
    content: Compare localStorage, IndexedDB and the Origin Private File System (OPFS) by API, capacity, performance and persistence, and learn when to use which, with code examples.
- - meta
  - name: description
    content: Compare localStorage, IndexedDB and the Origin Private File System (OPFS) by API, capacity, performance and persistence, and learn when to use which, with code examples.
- - meta
  - name: keywords
    content: indexeddb vs localstorage, localstorage vs indexeddb, opfs, origin private file system, browser storage, client-side storage, indexeddb wrapper, indexeddb library, storage quota, navigator.storage.persist, SignalDB
---
# localStorage vs IndexedDB vs OPFS

## Quick Answer

**Use localStorage for a few small settings, IndexedDB for structured application data, and the Origin Private File System (OPFS) for large files or high-performance file-based storage.** localStorage is synchronous and limited to a few megabytes. IndexedDB is asynchronous, transactional and can store large amounts of structured data. OPFS gives each website a private file system with fast synchronous access in Web Workers.

| | localStorage | IndexedDB | OPFS |
|---|---|---|---|
| **Data model** | String key/value pairs | Object stores with indexes and transactions | Files and directories |
| **Value types** | Strings only (objects need `JSON.stringify`) | Structured clone: objects, arrays, `Date`, `Blob`, `ArrayBuffer`, `Map`, … | Bytes (text or binary) |
| **API style** | Synchronous | Asynchronous (event-based) | Asynchronous; synchronous access handles in dedicated Web Workers |
| **Capacity** | Around 5 MB per origin | Quota-based, usually a large share of free disk space | Quota-based, shared with IndexedDB |
| **Available in Web Workers** | No | Yes | Yes |
| **Querying** | Lookup by key | Lookup by key and indexes, cursors | None (you read files) |
| **Blocks the main thread** | Yes, on every read and write | No | No |
| **Typical use** | Theme, language, small flags | App data, offline caches, local databases | Large files, binary data, database engines |

## localStorage

[`localStorage`](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage) is the simplest browser storage: a synchronous key/value store for strings that persists across sessions.

```js
localStorage.setItem('settings', JSON.stringify({ theme: 'dark' }))
const settings = JSON.parse(localStorage.getItem('settings') ?? '{}')
```

**Strengths**
- Very simple API, available everywhere.
- Synchronous reads are convenient for values needed at startup, such as the color theme.

**Limitations**
- **Small**: browsers allow around 5 MB per origin.
- **Strings only**: everything has to be serialized and parsed, which gets slow for larger data.
- **Blocks the main thread**: every access is synchronous, so large reads and writes cause jank.
- **No access from Web Workers or Service Workers.**

`sessionStorage` has the same API but is cleared when the tab is closed.

## IndexedDB

[IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API) is a transactional database built into every browser. It stores JavaScript values (anything that can be structured-cloned) in object stores, supports indexes for lookups, and runs asynchronously.

```js
const request = indexedDB.open('app', 1)
request.onupgradeneeded = () => {
  request.result.createObjectStore('todos', { keyPath: 'id' })
}
request.onsuccess = () => {
  const db = request.result
  const tx = db.transaction('todos', 'readwrite')
  tx.objectStore('todos').put({ id: '1', title: 'Buy milk', completed: false })
}
```

**Strengths**
- **Large capacity**: limited by the browser's storage quota, not a fixed size.
- **Rich values**: stores objects, dates, binary data and blobs without serialization.
- **Asynchronous** and available in Web Workers and Service Workers.
- **Transactions and indexes** for consistent writes and efficient lookups.

**Limitations**
- **Verbose, event-based API.** Most developers use a wrapper library or a database built on top (see below).
- **Limited query capabilities**: lookups are by key or index; there are no ad-hoc queries on arbitrary fields.
- **Schema upgrades** are handled through version numbers and `onupgradeneeded`.

### IndexedDB Wrappers and Libraries

Because the raw API is cumbersome, IndexedDB is usually used through a library:

- **Thin wrappers** such as [`idb`](https://github.com/jakearchibald/idb) turn the event-based API into promises.
- **IndexedDB-first databases** such as [Dexie.js](https://dexie.org/) add a fluent query API and live queries.
- **Local databases with IndexedDB persistence** such as [SignalDB](#browser-storage-with-signaldb) or RxDB keep data queryable in memory or through their own query engine, add reactivity and sync, and use IndexedDB only for persistence.

See the [JavaScript database comparison](/comparison/) for the differences.

## OPFS (Origin Private File System)

The [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) is a file system that the browser provides privately to each origin. It is part of the File System API and is supported in all current major browsers. Unlike the File System Access API, it needs no permission prompt, and its files are not visible to the user.

```js
const root = await navigator.storage.getDirectory()
const fileHandle = await root.getFileHandle('todos.json', { create: true })

const writable = await fileHandle.createWritable()
await writable.write(JSON.stringify([{ id: '1', title: 'Buy milk' }]))
await writable.close()

const file = await fileHandle.getFile()
console.log(JSON.parse(await file.text()))
```

Safari added `createWritable()` later than the rest of OPFS. If you need to support older Safari versions, write through a synchronous access handle in a Web Worker instead.

In a dedicated Web Worker, `fileHandle.createSyncAccessHandle()` provides **synchronous, in-place reads and writes**. This is the fastest way to work with files in the browser, and it is what SQLite and other database engines compiled to WebAssembly use for persistence.

**Strengths**
- **Fast file I/O**, especially with synchronous access handles in workers.
- **Ideal for large or binary data** and for database engines that expect a file system.
- **Quota-based capacity**, like IndexedDB.

**Limitations**
- **No queries**: OPFS stores files; structure and indexing are up to you or your library.
- **Fastest API only in workers**: synchronous access handles are not available on the main thread.
- **Private to the origin**: users cannot open or export the files directly.

## Storage Limits, Quotas and Eviction

IndexedDB, OPFS, the Cache API and other storage APIs share **one quota per origin**. Browsers typically allow an origin to use a large share of the available disk space; the exact limits differ between browsers and devices. Check the current usage and quota with:

```js
const { usage, quota } = await navigator.storage.estimate()
console.log(`${(usage / 1e6).toFixed(1)} MB of ${(quota / 1e6).toFixed(0)} MB used`)
```

By default, storage is **best-effort**: when the device runs low on disk space, the browser may delete the data of origins that were not used recently. For data that must not be lost, request **persistent storage**:

```js
const persisted = await navigator.storage.persist()
```

Safari additionally deletes all script-writable storage (including IndexedDB and localStorage) of websites that the user has not interacted with for seven days, unless the site was added to the home screen as a web app. Apps that store important data locally should therefore also sync it to a server.

## When to Use Which

- **A handful of small values needed synchronously at startup** (theme, language, feature flags): **localStorage**.
- **Structured application data, offline data, caches of API responses**: **IndexedDB**, ideally through a library.
- **Large files, binary data, or a database engine that needs a file system**: **OPFS**.
- **HTTP responses for offline asset loading**: the **Cache API** in a Service Worker (not covered here).

Many apps combine them: settings in localStorage, data in IndexedDB or OPFS, and assets in the Cache API.

## Browser Storage with SignalDB

[SignalDB](/getting-started/) is a reactive local database that keeps collections in memory and persists them with a [persistence adapter](/data-persistence/). Switching the storage is a one-line change, and your queries, reactivity and sync code stay the same:

```js
import { Collection } from '@signaldb/core'
import createLocalStorageAdapter from '@signaldb/localstorage'
import createIndexedDBAdapter from '@signaldb/indexeddb'
import createOPFSAdapter from '@signaldb/opfs'

// small collection in localStorage
const settings = new Collection({ persistence: createLocalStorageAdapter('settings') })

// application data in IndexedDB
const todos = new Collection({ persistence: createIndexedDBAdapter('todos') })

// application data as a file in OPFS
const notes = new Collection({ persistence: createOPFSAdapter('notes.json') })

todos.find({ completed: false }).fetch() // same query API for every storage
```

Because queries run against the in-memory collection, they are synchronous and support MongoDB-like selectors on any field, regardless of which storage you choose. See the adapter references for [localStorage](/reference/localstorage/), [IndexedDB](/reference/indexeddb/) and [OPFS](/reference/opfs/), or [build your own adapter](/reference/core/createpersistenceadapter/).

## Frequently Asked Questions

### Is IndexedDB better than localStorage?

For anything beyond a few small values, yes. IndexedDB is asynchronous, stores structured data without serialization, has a much larger quota and works in Web Workers. localStorage is simpler and synchronous, which is only an advantage for tiny values needed at startup.

### How much data can I store in IndexedDB?

There is no fixed limit. IndexedDB is limited by the browser's storage quota for the origin, which is usually a large share of the free disk space. Use `navigator.storage.estimate()` to check it at runtime.

### What is OPFS used for?

OPFS is used for fast, private file storage in the browser: large or binary files, and database engines (for example SQLite compiled to WebAssembly) that need a file system with fast synchronous access.

### Is OPFS faster than IndexedDB?

For file-style reads and writes in a Web Worker with synchronous access handles, OPFS is typically faster than IndexedDB. For structured data with indexed lookups, IndexedDB is more convenient. Benchmark with your own data before you decide.

### Can browser storage be deleted?

Yes. Users can clear site data at any time, browsers may evict best-effort storage under storage pressure, and Safari deletes storage of sites that have not been used for seven days. Request persistent storage with `navigator.storage.persist()` and sync important data to a server.
