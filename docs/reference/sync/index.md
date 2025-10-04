---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/sync/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/sync/
- - meta
  - name: og:title
    content: '@signaldb/sync | SignalDB'
- - meta
  - name: og:description
    content: Explore the `SyncManager` class in SignalDB with all the details you need to efficiently manage data synchronization between local storage and remote sources.
- - meta
  - name: description
    content: Explore the `SyncManager` class in SignalDB with all the details you need to efficiently manage data synchronization between local storage and remote sources.
- - meta
  - name: keywords
    content: SyncManager, SignalDB, data synchronization, local storage, remote source, JavaScript, error handling, debouncing, collection management, sync process, reactivity adapter
---
# SyncManager

```ts
import { SyncManager } from '@signaldb/sync'

const syncManager = new SyncManager({
  pull: async () => {
    // your pull logic
  },
  push: async () => {
    // your push logic
  },
})

syncManager.addCollection(someCollection, {
  name: 'someCollection',
})
```

The `SyncManager` class in SignalDB is designed to handle the synchronization of collections between your local storage and a remote source. It manages both pushing local changes to the server and pulling updates from the server, ensuring that your data remains consistent and up-to-date.

## Constructor

### `new SyncManager(options)`

Creates a new instance of `SyncManager`.

#### Parameters

- `options` (`Options`): Configuration options for the sync manager.

  - `pull`: Function to fetch data from the remote source. The function gets the collection options as the first parameter. The second parameter is an object containing the following properties:
    - `lastFinishedSyncStart`: The start time of the last finished sync (if available).
    - `lastFinishedSyncEnd`: The end time of the last finished sync (if available).
  - `push`: Function to send changes to the remote source. The function gets the collection options as the first parameter. The second parameter is an object that contains the following properties:
    - `changes`:
      - `added`: An array of added items.
      - `modified`: An array of updated items.
      - `modifiedFields`: A map with the modified fields per item id.
      - `removed`: An array of removed items.
    - `rawChanges`: An array of the raw change operations.

  - `registerRemoteChange`: Optional function to register a callback for remote changes. The callback can also return a cleanup function to remove the listener.
  - `id`: Optional unique identifier for the sync manager.
  - `storageAdapter`: Optional function to create a storage adapter. Takes 2 arguments: `name` and `registerErrorHandler`.
  - `reactivity`: Optional reactivity adapter for handling reactivity.
  - `onError`: Optional function to handle errors.
  - `autostart`: Optional flag to start syncing automatically after adding collections (default: `true`).
  - `debounceTime`: Optional time in milliseconds to debounce pushing changes (default: `100`).


## Methods

### `addCollection(collection, options)`

Adds a collection to the sync manager.

#### Parameters

- `collection` (`Collection`): The collection to add.
- `options` (`SyncOptions`): Configuration options for the collection.

### `getCollection(name)` (deprecated)

Retrieves a collection and its options by name.

### `getCollectionProperties(name)`

Retrieves the collection options by name.

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

### `startSync(name)`

Setup a collection to be synced with remote changes and enable automatic pushing changes to the remote source.

#### Parameters

- `name` (`string`): The name of the collection.

### `pauseSync(name)`

Pauses the sync process for a collection. This means that the collection will not be synced with remote changes and changes will not automatically be pushed to the remote source.

#### Parameters

- `name` (`string`): The name of the collection.

### `startAll()`

Setup all collections to be synced with remote changes and enable automatic pushing changes to the remote source.

### `pauseAll()`

Pauses the sync process for all collections. This means that the collections will not be synced with remote changes and changes will not automatically be pushed to the remote source.

### `pushChanges(name)`

Initiates the push process for a collection, syncing only if there are changes.

#### Parameters

- `name` (`string`): The name of the collection.

### `dispose()`

Disposes all internal collections and other data structures.
