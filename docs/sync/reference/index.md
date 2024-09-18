---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/sync/reference/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/sync/reference/
- - meta
  - name: og:title
    content: SyncManager Reference - SignalDB
- - meta
  - name: og:description
    content: Explore the `SyncManager` class in SignalDB. This reference guide covers automatic syncing, error handling, debouncing, and collection management, providing all the details you need to efficiently manage data synchronization between local storage and remote sources.
- - meta
  - name: description
    content: Explore the `SyncManager` class in SignalDB. This reference guide covers automatic syncing, error handling, debouncing, and collection management, providing all the details you need to efficiently manage data synchronization between local storage and remote sources.
- - meta
  - name: keywords
    content: SyncManager, SignalDB, data synchronization, local storage, remote source, JavaScript, error handling, debouncing, collection management, sync process, reactivity adapter
---
# `SyncManager`

The `SyncManager` class in SignalDB is designed to handle the synchronization of collections between your local storage and a remote source. It manages both pushing local changes to the server and pulling updates from the server, ensuring that your data remains consistent and up-to-date.

## Key Features

- **Automatic Syncing:** Synchronizes local changes with a remote source and updates local data from the server.
- **Error Handling:** Provides options to handle errors that occur during the sync process.
- **Debouncing:** Uses debouncing to limit the frequency of sync operations, reducing unnecessary network requests.
- **Collection Management:** Easily add and manage collections that require synchronization.

## Constructor

### `new SyncManager(options)`

Creates a new instance of `SyncManager`.

#### Parameters

- `options` (`Options`): Configuration options for the sync manager.

  - `pull`: Function to fetch data from the remote source.
  - `push`: Function to send changes to the remote source.
  - `registerRemoteChange`: Optional function to register a callback for remote changes.
  - `id`: Optional unique identifier for the sync manager.
  - `persistenceAdapter`: Optional function to create a persistence adapter.
  - `reactivity`: Optional reactivity adapter for handling reactivity.
  - `onError`: Optional function to handle errors.

## Methods

### `addCollection(collection, options)`

Adds a collection to the sync manager.

#### Parameters

- `collection` (`Collection`): The collection to add.
- `options` (`SyncOptions`): Configuration options for the collection.

### `getCollection(name)`

Retrieves a collection and its options by name.

#### Parameters

- `name` (`string`): The name of the collection.

#### Returns

- `Tuple<Collection, SyncOptions>`: The collection and its options.

### `syncAll()`

Starts the sync process for all collections managed by the sync manager.

### `isSyncing(name?)`

Checks if a specific collection or any collection is currently being synced.

#### Parameters

- `name` (`string`, optional): The name of the collection. If omitted, checks all collections.

#### Returns

- `boolean`: `true` if syncing, `false` otherwise.

### `sync(name, options)`

Starts the sync process for a specific collection.

#### Parameters

- `name` (`string`): The name of the collection.
- `options` (`object`, optional): Sync options.
  - `force` (`boolean`, optional): If `true`, forces the sync process even if no changes are detected.
  - `onlyWithChanges` (`boolean`, optional): If `true`, syncs only if there are changes.

### `pushChanges(name)`

Initiates the push process for a collection, syncing only if there are changes.

#### Parameters

- `name` (`string`): The name of the collection.
