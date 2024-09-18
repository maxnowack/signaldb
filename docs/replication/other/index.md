---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/replication/other/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/replication/other/
- - meta
  - name: og:title
    content: Other Replication Options - SignalDB
- - meta
  - name: og:description
    content: Explore custom replication options for SignalDB, including implementing your own replication logic and using the RxDB Persistence Adapter. Note that this documentation is deprecated; refer to the SyncManager and new synchronization pages for the latest information.
- - meta
  - name: description
    content: Explore custom replication options for SignalDB, including implementing your own replication logic and using the RxDB Persistence Adapter. Note that this documentation is deprecated; refer to the SyncManager and new synchronization pages for the latest information.
- - meta
  - name: keywords
    content: SignalDB, replication options, custom replication, RxDB Persistence Adapter, SyncManager, data synchronization, backend integration, ReplicatedCollection, SignalDB documentation
---
# Other Replication Options

::: warning
This section of the documentation is deprecated in favor of the [`SyncManager`](/sync/reference/). Please also see the new documentation pages about [data synchronization](/sync/) and [sync implementation](/sync/implementation/).
:::

If the provided replication options don't suit your needs, you can always implement your own replication logic. SignalDB provides a flexible API that allows you to create custom replication logic with any external data source. You can take a look at the [`ReplicatedCollection` class](https://github.com/maxnowack/signaldb/blob/main/packages/signaldb/src/ReplicatedCollection.ts) to get started.

Another option is to use the [RxDB Persistence Adapter](/data-persistence/rxdb/), which allows you to use the replication functionality of RxDB together with SignalDB. The replication protocol of RxDB is currently more powerful and maybe fills your needs better.

For guidance on implementing custom replication logic or integrating SignalDB with your backend, don't hesitate to engage with the community on [Github](https://github.com/maxnowack/signaldb/discussions).
```
