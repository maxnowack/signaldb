---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/core-concepts/
---
# Core Concepts

The following are some key concepts that are important to understanding how to use SignalDB effectively.

## Collections

In SignalDB, all data is held in memory, which makes query performance exceptionally fast. Users can create collections of documents, where each document is a record in the database. Queries can be performed on these collections to fetch data according to certain criteria. This architecture also plays a significant role in achieving optimistic UI strategies.

### Schemaless

SignalDB is schemaless, meaning that you don't have to define a schema for your data before you start using it. This allows you to store any data you want, without having to worry about defining a schema first.

More information on how to define collections and perform queries will be found in the dedicated sections:
* [Collections](/collections/)
* [Queries](/queries/)

### Optimistic UI

Optimistic UI is an approach where user interfaces are updated optimistically in response to user actions before the actual server response is received. This approach provides a smoother and more responsive user experience, as the interface doesn't have to wait for the server to confirm the action's success.

SignalDB's schemaless nature and reactive querying through reactivity adapters enable the creation of robust optimistic UI implementations. When a user triggers an action that modifies the data, such as submitting a form, SignalDB's reactivity system can immediately update the UI to reflect the intended changes. This is possible because the reactivity adapters automatically propagate changes to the UI components that rely on the affected data.

## Signals and Reactivity

As the name suggests, SignalDB's reactivity is based on signals, a concept from functional reactive programming. The concept is quite old, but is becoming popular again since the hype around solidjs in early 2023. Since many signal libraries are currently popping up, SignalDB is designed to be library agnostic. Reactivity Adapters in SignalDB enable reactive querying of the documents inside a collection. They provide a simple interface that allows you to incorporate a signal library. By using reactivity adapters, you can ensure that whenever the data in your collections changes, any reactive queries tied to that data will automatically update, keeping your application's state consistent with your data.

To learn more about signals, check out [The Evolution of Signals in JavaScript](https://dev.to/this-is-learning/the-evolution-of-signals-in-javascript-8ob) by Ryan Carniato (Author of SolidJS).

Normally you'll simply use a pre-defined reactivity adapter for the signal library you're using. Check out the available adapters in the [Reactivity section](/reactivity/) of the documentation.

## Memory Adapters

Memory Adapters in SignalDB play a crucial role in controlling how and where data is saved in memory. These adapters provide an abstraction over the underlying memory storage mechanism and give users the flexibility to define custom methods for handling data storage operations.

In the simplest terms, a memory adapter is a piece of code that dictates how your data is stored in memory. When you perform an write or a read operation, the adapter is responsible for translating these high-level operations into low-level memory operations.

Normally you don't have to care about memory adapters as SignalDB comes with a default one. Since a memory adapter is a subset of the `Array` class, the most basic memory adapter is an emtpty array (`[]`).

## Data Persistence

SignalDB only saves the data in the memory and it will be lost after the memory was cleared (e.g. page reload). Normally, data shouldn't be lost and you want to persist it. This is where persistence adapters are kicking in.

Persistence adapters in SignalDB serve a crucial role in ensuring that your data remains intact across different user sessions or application reloads. These adapters facilitate data persistence by providing a standard interface for storing and retrieving data, thus abstracting the specifics of the underlying storage mechanism.

A Persistence Adapter provides the necessary code to interact with a specific storage medium, such as localStorage, IndexedDB, or even a remote server. The role of the adapter is to translate the high-level operations that you perform on your data (such as saving or loading a document) into low-level operations that the storage medium can understand.

The key benefit of using Persistence Adapters is flexibility. As they provide an abstraction layer over the storage system, you can switch between different storage systems with minimal impact on the rest of your code.

Check out the documentation page for [persistence adapters](/data-persistence/)
