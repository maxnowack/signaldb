---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/core-concepts/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/core-concepts/
- - meta
  - name: og:title
    content: Core Concepts | SignalDB
- - meta
  - name: og:description
    content: Learn about the core concepts of SignalDB, including collections, schema-less data storage, optimistic UI, signals and reactivity and data persistence.
- - meta
  - name: description
    content: Learn about the core concepts of SignalDB, including collections, schema-less data storage, optimistic UI, signals and reactivity and data persistence.
- - meta
  - name: keywords
    content: SignalDB core concepts, SignalDB collections, schema-less database, optimistic UI, JavaScript reactivity, signals, memory adapters, data persistence, reactive database, frontend development, SignalDB features
---
# Core Concepts

The following are some key concepts that are important to understanding how to use SignalDB effectively.

## Collections

In SignalDB, all data is stored in memory, making query performance exceptionally fast. Users can create collections of documents, where each document is a record in the database. Queries can be run against these collections to retrieve data according to specific criteria. This architecture also plays an important role in achieving optimistic UI strategies.

### Schemaless

SignalDB is schema-less, which means you don't need to define a schema for your data before you start using it. This allows you to store any data you want without worrying about defining a schema first.

More information on how to define collections and perform queries will be found in the dedicated sections:
* [Collections](/reference/core/collection/)
* [Queries](/queries/)

### Optimistic UI

Optimistic UI is an approach where user interfaces are updated optimistically in response to user actions before the actual server response is received.This approach provides a smoother and more responsive user experience because the UI doesn't have to wait for the server to confirm the success of the action.

SignalDB's schema-less nature and reactive querying via reactivity adapters enable the creation of robust, optimistic UI implementations. When a user triggers an action that changes the data, such as submitting a form, SignalDB's reactivity system can immediately update the UI to reflect the intended changes. This is possible because the reactivity adapters automatically propagate changes to the UI components that rely on the affected data.

## Signals and Reactivity

As the name suggests, SignalDB's reactivity is based on signals, a concept from functional reactive programming.

The concept is quite old, but is becoming popular again since the hype around solidjs in early 2023. Since many signal libraries are currently emerging, SignalDB is designed to be library agnostic. Reactivity adapters in SignalDB enable reactive querying of the documents in a collection. They provide a simple interface that allows you to integrate a signal library. By using reactivity adapters, you can ensure that whenever the data in your collections changes, any reactive queries tied to that data are automatically updated, keeping the state of your application consistent with your data.

To learn more about signals, read [The Evolution of Signals in JavaScript](https://dev.to/this-is-learning/the-evolution-of-signals-in-javascript-8ob) by Ryan Carniato (author of SolidJS).

Typically, you'll simply use a predefined reactivity adapter for the signal library you're using. Check out the available adapters in the [Reactivity section](/reactivity/) of the documentation.

## Memory Adapters

SignalDB's memory adapters play a critical role in controlling how and where data is stored in memory.

These adapters provide an abstraction over the underlying memory storage mechanism, giving users the flexibility to define custom methods for handling data storage operations.

Simply put, a memory adapter is a piece of code that dictates how your data is stored in memory. When you perform a write or read operation, the adapter is responsible for translating those high-level operations into low-level memory operations.

Normally, you don't need to worry about memory adapters because SignalDB comes with a default one. Since a memory adapter is a subset of the `Array` class, the most basic memory adapter is an emtpty array (`[]`).

You can also create a MemoryAdapter on your own. See the [createMemoryAdapter reference](/reference/core/creatememoryadapter/) for more information.

## Data Persistence

SignalDB only stores the data in memory and it will be lost when the memory is flushed (e.g. page reload).

Normally you don't want to lose data and you want to persist it. This is where storage adapters come in.

Storage adapters in SignalDB play a critical role in ensuring that your data remains intact across multiple user sessions or application reloads. These adapters facilitate data persistence by providing a standard interface for storing and retrieving data, thereby abstracting from the specifics of the underlying storage mechanism.

A storage adapter provides the necessary code to interact with a specific storage medium, such as localStorage, IndexedDB, or even a remote server. The role of the adapter is to translate the high-level operations that you perform on your data (such as saving or loading a document) into low-level operations that the storage medium can understand.

The main benefit of using storage adapters is flexibility. Because they provide an abstraction layer over the storage system, you can switch between different storage systems with minimal impact on the rest of your code.

See also the [storage adapters](/data-persistence/) documentation page.
