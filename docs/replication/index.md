---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/replication/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/replication/
- - meta
  - name: og:title
    content: Data Replication in SignalDB
- - meta
  - name: og:description
    content: Explore the data replication capabilities of SignalDB, including `ReplicatedCollection` and `AutoFetchCollection`. Learn about their usage, deprecation, and alternatives like `SyncManager` for efficient data synchronization.
- - meta
  - name: description
    content: Explore the data replication capabilities of SignalDB, including `ReplicatedCollection` and `AutoFetchCollection`. Learn about their usage, deprecation, and alternatives like `SyncManager` for efficient data synchronization.
- - meta
  - name: keywords
    content: SignalDB, data replication, ReplicatedCollection, AutoFetchCollection, data synchronization, SyncManager, JavaScript, TypeScript, data synchronization alternatives
---
# Data Replication in SignalDB

::: warning
This feature was deprecated in favor of the [`SyncManager`](/sync/reference/). Please also see the new documentation pages about [data synchronization](/sync/) and [sync implementation](/sync/implementation/).
:::

For seamless integration of your app with remote services, SignalDB offers robust data replication capabilities. Whether you're building a local app or sharing data across multiple clients, SignalDB's modular replication system ensures efficient data synchronization.


## `ReplicatedCollection`

Central to SignalDB's replication functionality is the `ReplicatedCollection` class. This specialized class streamlines the replication process, allowing you to effortlessly replicate data to any remote service. It inherits from the `Collection` class, so you can use it just like any other collection.
The `ReplicatedCollection` doesn't provide an automatic conflict resolution mechanism. You must handle any conflicts that arise during replication manually. This includes managing both pull and push conflicts in your handlers. Similarly, the `ReplicatedCollection` does not automatically handle errors that occur during the replication process. If a call to your remote service (e.g., https://api.example.com/todos) fails, it is your responsibility to manage these errors and implement appropriate retry or recovery mechanisms.

The usage of the `ReplicatedCollection` is really simple:

```js
const Todos = new ReplicatedCollection({
  pull: async () => {
    // The pull method is for fetching data from the remote service
    // similar to the persistence adapters, you have two options to return the fetched data

    // You can return the data directly
    // return { items: [...] }

    // Or you can return only the changes
    // return { changes: { added: [...], modified: [...], removed: [...] } }
  },
  push: async (changes, items) => {
    // The push method is called when the local data has changed
    // As the first parameter you get the changes in the format { added: [...], modified: [...], removed: [...] }
    // As the second parameter you also get all items in the collection, if you need them
    // in the push method, no return value is expected
  },
  registerRemoteChange: async (onChange) => {
    // The registerRemoteChange method is for registering a callback that is called when the remote data has changed
    // The callback can accept a LoadResponse. If no LoadResponse is supplied, pull will be called instead.
  },

  // You can also optionally specify a persistence adapter
  // If a persistence adapter is used, the data is loaded first and will be updated after the server data is fetched
  // If the data will be updated, the data will be saved to the persistence adapter and pushed to the server simultaneously
  persistence: createLocalStorageAdapter('todos'),
})
```

## `AutoFetchCollection`

The `AutoFetchCollection` class is a specialized variant of the `ReplicatedCollection` that automatically fetches data from the remote service when the collection is accessed. This is useful if you want to fetch specific data on demand rather than pulling the whole dataset at app start.

The concept of the `AutoFetchCollection` is, that it calls the `fetchQueryItems` method everytime a query is executed on the collection. This way, you can fetch only the data that is needed for the query. The first time the query is executed, the query will return a empty dataset (if the data is not already fetched). After the data is fetched, the query will reactively update and return the loaded data.
While the data is fetched, the you can observe the loading state with the `isLoading` function on the collection to show a loading indicator. The `ìsLoading` function will be updated reactively.

The usage of the `AutoFetchCollection` is also really simple:

```js
const Todos = new AutoFetchCollection({
  fetchQueryItems: async (selector) => {
    // The fetchQueryItems method is for fetching data from the remote service.
    // The selector parameter is the query that is executed on the collection.
    // Use this to fetch only the data that is needed for the query.
    // Also make sure that the returned data matches the query to avoid inconsistencies
    // The return value is similar to one of the pull method of the ReplicatedCollection,

    // You can return the data directly
    // return { items: [...] }

    // Or you can return only the changes
    // return { changes: { added: [...], modified: [...], removed: [...] } }
  },

  // optional, specifie the delay in milliseconds after which the data will be
  // purged from the collection after the query is not used anymore
  // default is 10 seconds
  purgeDelay: 1000 * 10,

  push: async (changes, items) => {
    // The push method is the same as in the ReplicatedCollection
    // The push method is called when the local data has changed
    // As the first parameter you get the changes in the format { added: [...], modified: [...], removed: [...] }
    // As the second parameter you also get all items in the collection, if you need them
    // in the push method, no return value is expected
  },

  // Like in the ReplicatedCollection, you can also optionally specify a persistence adapter
  // If a persistence adapter is used, the data is loaded first and will be updated after the server data is fetched
  // If the data will be updated, the data will be saved to the persistence adapter and pushed to the server simultaneously
  persistence: createLocalStorageAdapter('todos'),
})

// You can also observe the loading state of the collection.
const loading = Todos.isLoading()

// The isLoading method takes an optional selector parameter to observe the loading state of a specific query
const postsFromMaxLoading = Todos.isLoading({ author: 'Max' })

// It's also possible to register and unregister queries manuallly
Todos.registerQuery({ author: 'Max' })
Todos.unregisterQuery({ author: 'Max' })
```
