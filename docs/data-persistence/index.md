---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-persistence/
- - meta
  - name: og:title
    content: Data Persistence Adapters | SignalDB
- - meta
  - name: og:description
    content: Learn how Data Persistence Adapters in SignalDB provide an abstraction layer over different storage systems like localStorage, IndexedDB, and remote servers.
- - meta
  - name: description
    content: Learn how Data Persistence Adapters in SignalDB provide an abstraction layer over different storage systems like localStorage, IndexedDB, and remote servers.
- - meta
  - name: keywords
    content: data persistence, adapters, SignalDB, localStorage, IndexedDB, remote server, data storage, data retrieval, storage abstraction
---
# Data Persistence Adapters

Persistence adapters in SignalDB provide the mechanism for storing and retrieving data, ensuring that your data is kept safe across sessions and reloads of your application.

These adapters interact with the underlying storage medium, such as localStorage, IndexedDB, or even a remote server, and handle the specifics of those storage systems while providing a consistent interface for data operations in your application.

Persistence adapters are responsible for transforming the high-level operations you perform on your data (such as saving a document or loading a collection) into the low-level operations that the specific storage system can understand and perform.

The main benefit of using persistence adapters is the abstraction they provide. They allow SignalDB to remain agnostic to the underlying storage system. This means that you can switch between different systems without changing the rest of your code.
