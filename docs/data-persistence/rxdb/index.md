---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/rxdb/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-persistence/rxdb/
- - meta
  - name: og:title
    content: RxDB Persistence Adapter - SignalDB
- - meta
  - name: og:description
    content: Discover how to integrate an RxDB persistence adapter with SignalDB to enhance data persistence and replication. Learn about the benefits, mechanics, and implementation details of using RxDB for extended data management capabilities.
- - meta
  - name: description
    content: Discover how to integrate an RxDB persistence adapter with SignalDB to enhance data persistence and replication. Learn about the benefits, mechanics, and implementation details of using RxDB for extended data management capabilities.
- - meta
  - name: keywords
    content: SignalDB, RxDB, persistence adapter, data persistence, data replication, JavaScript, IndexedDB, localStorage, storage systems, data management, real-time database, implementation guide
---
# RxDB Persistence Adapter

In today's data-centric applications, ensuring data persistence and consistency is paramount. While SignalDB, an in-memory database, is efficient, it runs the risk of losing data during memory flushes, such as page reloads. This is where the concept of persistence adapters comes in, especially for [RxDB](https://rxdb.info). RxDB, a real-time database for JavaScript applications, offers features that can significantly extend the capabilities of SignalDB. Using an RxDB persistence adapter not only enables data persistence in SignalDB, but also facilitates data replication.

Diving deeper into the mechanics of persistence adapters within SignalDB, their primary function becomes clear: they serve as intermediaries between SignalDB and various storage media such as localStorage, IndexedDB, or even remote servers. These adapters effortlessly convert the high-level data operations typical of your applications into the low-level operations recognizable by the specific storage system. The seamless integration of an RxDB persistence adapter means that developers can take advantage of RxDB's inherent replication capabilities, further enhancing SignalDB's data management capabilities. The idea is to use the persistence adapter to store your data within RxDB so that it can be easily replicated to external systems.

The inherent benefit of using persistence adapters, especially one optimized for RxDB, is the unparalleled flexibility and abstraction they provide. By allowing SignalDB to communicate with RxDB's powerful storage and replication capabilities, developers can ensure data continuity even in scenarios where applications are reloaded or user sessions are extended. In addition, decoupling SignalDB from the storage mechanism through the adapter ensures that changes or migrations to different storage systems can be made with minimal friction or code changes. In essence, an RxDB persistence adapter acts as a bridge between SignalDB's in-memory operations and persistent, replicated data.

In our [RxDB Example](https://github.com/maxnowack/signaldb/tree/main/examples/rxdb) is a demo implementation of a persistence adapter for RxDB. It's not optimized, but it works. You'll find the helper function to create a persistence adapter for a RxCollection here: [`createRxPersistenceAdapter`](https://github.com/maxnowack/signaldb/blob/main/examples/rxdb/src/utils/createRxPersistenceAdapter.ts) and the usage of this function [here](https://github.com/maxnowack/signaldb/blob/main/examples/rxdb/src/system/setupCollection/persistence.ts).
