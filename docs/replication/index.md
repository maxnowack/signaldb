---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/replication/
---
# Data Replication in SignalDB

For seamless integration of your app with remote services, SignalDB offers robust data replication capabilities. Whether you're building a local app or sharing data across multiple clients, SignalDB's modular replication system ensures efficient data synchronization.


## `ReplicatedCollection`

Central to SignalDB's replication functionality is the `ReplicatedCollection` class. This specialized class streamlines the replication process, allowing you to effortlessly replicate data to any remote service. It inherits from the `Collection` class, so you can use it just like any other collection.

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
    // The callback takes no parameters. After you called the onChange callback, the pull method is called
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
```
