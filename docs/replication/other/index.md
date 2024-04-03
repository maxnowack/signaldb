---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/replication/other/
---
# Other Replication Options

If the provided replication options don't suit your needs, you can always implement your own replication logic. SignalDB provides a flexible API that allows you to create custom replication logic with any external data source. You can take a look at the [`ReplicatedCollection` class](https://github.com/maxnowack/signaldb/blob/main/packages/signaldb/src/ReplicatedCollection.ts) to get started.

Another option is to use the [RxDB Persistence Adapter](/data-persistence/rxdb/), which allows you to use the replication functionality of RxDB together with SignalDB. The replication protocol of RxDB is currently more powerful and maybe fills your needs better.

For guidance on implementing custom replication logic or integrating SignalDB with your backend, don't hesitate to engage with the community on [Github](https://github.com/maxnowack/signaldb/discussions).
```
