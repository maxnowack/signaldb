---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/replication/rxdb/
---
# RxDB Persistence Adapter

You can replicate your data with external systems if you persist your data in [RxDB](https://rxdb.info). In our [example](https://github.com/maxnowack/signaldb/tree/main/example) is a demo implementation of a persistence adapter for RxDB. It's not optimized, but it works. You'll find the helper function to create a persistence adapter for a RxCollection here: [`createRxPersistenceAdapter`](https://github.com/maxnowack/signaldb/blob/main/example/src/utils/createRxPersistenceAdapter.ts) and the usage of this function [here](https://github.com/maxnowack/signaldb/blob/main/example/src/system/setupCollection/persistence.ts).
