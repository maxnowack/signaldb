---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/replication/
---
# Data Replication in SignalDB

For seamless integration of your app with remote services, SignalDB offers robust data replication capabilities. Whether you're building a local app or sharing data across multiple clients, SignalDB's modular replication system ensures efficient data synchronization.

Central to SignalDB's replication functionality is the `ReplicatedCollection` class. This specialized class streamlines the replication process, allowing you to effortlessly replicate data to any remote service.

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
