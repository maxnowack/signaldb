---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/sync/implementation/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/sync/implementation/
- - meta
  - name: og:title
    content: Implementing Synchronization | SignalDB
- - meta
  - name: og:description
    content: Learn to sync data on the frontend with SignalDB. This guide shows how to create a SyncManager, add collections, and use pull/push methods.
- - meta
  - name: description
    content: Learn to sync data on the frontend with SignalDB. This guide shows how to create a SyncManager, add collections, and use pull/push methods.
- - meta
  - name: keywords
    content: SignalDB, synchronization, SyncManager, frontend sync, pull method, push method, real-time sync, JavaScript, TypeScript, collection setup, API integration, reactive updates
---

# Implementing Synchronization

This page describes how remote synchronization could be implemented on the frontend side.

## Creating a [`SyncManager`](/sync/reference/)

The `SyncManager` is the main class that handles synchronization. To get started with implementing synchronization in your app, you need to create a `SyncManager` instance. The `SyncManager` constructor takes an option object as the first and only parameter. This object contains the methods for your `pull` and `push` logic and also a method to create a `persistenceAdapter` that will be used internally to store snapshot, changes and sync operations. This is needed in case you need to cache those data offline (defaults to [`createLocalStorageAdapter`](/data-persistence/local-storage/)).
Additionally a `reactivityAdapter` can be passed to the options object. This adapter is used to make some of the functions provided by the `SyncManager` reactive (e.g. `isSyncing()`). There is also a `registerRemoteChange` method that can be used to register a method for notifying the `SyncManager` about remote changes.

```ts
import { SyncManager } from 'signaldb-sync'

const syncManager = new SyncManager({
  reactivityAdapter: someReactivityAdapter,
  persistenceAdapter: name => createLocalPersistenceAdapter(name),
  pull: async () => {
    // your pull logic
  },
  push: async () => {
    // your push logic
  },
  registerRemoteChange: (collectionOptions, onChange) => {
    // …
  }
})
```
## Adding Collections

Before we go in the details of the `pull` and `push` methods, we need to understand how we add collection to our `syncManager`. The `addCollection` method takes two parameters. The first one is the collection itself and the second one is an option object. This object must contain at least a `name` property that will be used to identify the collection in the `syncManager`. You can also pass other informations to the options object. These properties will be passed to your `push` & `pull` methods and can be used to access additionally informations about the collection that are needed for the synchronization (e.g. api endpoint url). This concept also allows you to do things like passing `canRead`/`canWrite` methods to the options that are later on used to check if the user has the necessary permissions to `pull`/`push`.

```ts
import { Collection } from 'signaldb'

const someCollection = new Collection()

syncManager.addCollection(someCollection, {
  name: 'someCollection',
  apiPath: '/api/someCollection',
})
```

## Implementing the `pull` method

After we've added our collection to the `syncManager`, we can start implementing the `pull` method. The `pull` method is responsible for fetching the latest data from the server and applying it to the collection. The `pull` method is called whenever the `syncAll` or the `sync(name)` method are called. During sync, the `pull` method will be called for each collection that was added to the `syncManager`. It's receiving the collection options, passed to the `addCollection` method, as the first parameter and an object with additional information, like the `lastFinishedSyncStart` and `lastFinishedSyncEnd` timestamps, as the second parameter. The `pull` method must return a promise that resolves to an object with either an `items` property containing all items that should be applied to the collection or a `changes` property containing all changes `{ added: T[], modified: T[], removed: T[] }`.

```ts
const syncManager = new SyncManager({
  // …
  pull: async ({ apiPath }, { lastFinishedSyncStart }) => {
    const data = await fetch(`${apiPath}?since=${lastFinishedSyncStart}`).then(res => res.json())

    return { items: data }
  },
  // …
})
```

## Implementing the `push` method

The `push` method is responsible for sending the changes to the server. The `push` method is called during sync for each collection that was added to the `syncManager` if changes are present. It's receiving the collection options, passed to the `addCollection` method, as the first parameter and an object including the changes that should be sent to the server as the second parameter. The `push` method returns a promise without a resolved value.

If an error occurs during the `push`, the sync for the collection will be aborted and the error will be thrown.
**There are some errors that need to be handled by yourself. These are normally validation errors (e.g. `4xx` status codes) were the sync shouldn't fail, but the local data should be overwritten with the latest server data.**
If you throw these errors in your `push` method, the `syncManager` will keep the changes passed to the `push` method and will try to `push` them again on the next sync. This can lead to a loop where the changes are never pushed successfully to the server. To prevent this, handle those errors in the `push` method and just return afterwards.

```ts
const syncManager = new SyncManager({
  // …
  push: async ({ apiPath }, { changes }) => {
    await Promise.all(changes.added.map(async (item) => {
      const response = await fetch(apiPath, { method: 'POST', body: JSON.stringify(item) })
      if (response.status >= 400 && response.status <= 499) return
      await response.text()
    }))

    await Promise.all(changes.modified.map(async (item) => {
      const response = await fetch(apiPath, { method: 'PUT', body: JSON.stringify(item) })
      if (response.status >= 400 && response.status <= 499) return
      await response.text()
    }))

    await Promise.all(changes.removed.map(async (item) => {
      const response = await fetch(apiPath, { method: 'DELETE', body: JSON.stringify(item) })
      if (response.status >= 400 && response.status <= 499) return
      await response.text()
    }))
  },
  // …
})
```

## Handle Remote Changes

To handle remote changes for a specific collection, you have to get the event handler to call on remote changes through the `registerRemoteChange` method. This method gets the `collectionOptions` as the first parameter and an `onChange` handler a the second parameter. The `onChange` handler can be called after changes were received from the server for the collection that matches the provided `collectionOptions`. The `onChange` handler takes optionally the changes as the first parameter. If the changes are not provided, the `pull` method will be called for the collection.

```ts
const syncManager = new SyncManager({
  // …
  registerRemoteChanges: (collectionOptions, onChange) => {
    someRemoteEventSource.addEventListener('change', (collection) => {
      if (collectionOptions.name === collection) onChange()
    })
  },
  // …
})
```

## Example Implementations

### Simple RESTful API

Below is an example implementation of a simple REST API.

```js
import { EventEmitter } from 'node:events'
import { Collection, SyncManager } from 'signaldb'

const Authors = new Collection()
const Posts = new Collection()
const Comments = new Collection()

const errorEmitter = new EventEmitter()
errorEmitter.on('error', (message) => {
  // display validation errors to the user
})

const apiBaseUrl = 'https://example.com/api'
const syncManager = new SyncManager({
  pull: async ({ apiPath }) => {
    const data = await fetch(`${apiBaseUrl}${apiPath}`).then(res => res.json())
    return { items: data }
  },
  push: async ({ apiPath }, { changes }) => {
    await Promise.all(changes.added.map(async (item) => {
      const response = await fetch(apiPath, { method: 'POST', body: JSON.stringify(item) })
      const responseText = await response.text()
      if (response.status >= 400 && response.status <= 499) {
        errorEmitter.emit('error', responseText)
        return
      }
    }))

    await Promise.all(changes.modified.map(async (item) => {
      const response = await fetch(apiPath, { method: 'PUT', body: JSON.stringify(item) })
      const responseText = await response.text()
      if (response.status >= 400 && response.status <= 499) {
        errorEmitter.emit('error', responseText)
        return
      }
    }))

    await Promise.all(changes.removed.map(async (item) => {
      const response = await fetch(apiPath, { method: 'DELETE', body: JSON.stringify(item) })
      const responseText = await response.text()
      if (response.status >= 400 && response.status <= 499) {
        errorEmitter.emit('error', responseText)
        return
      }
    }))
  },
})

syncManager.addCollection(Posts, {
  name: 'posts',
  apiPath: '/posts',
})
syncManager.addCollection(Authors, {
  name: 'authors',
  apiPath: '/authors',
})
syncManager.addCollection(Comments, {
  name: 'comments',
  apiPath: '/comments',
})
```

### More Examples

If you think that an example is definitely missing here, feel free to create a pull request.
Also don't hesitate to create a [discussion](https://github.com/maxnowack/signaldb/discussions/new/choose) if you have any questions or need help with your implementation.
