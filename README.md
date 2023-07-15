# SignalDB

SignalDB is a client side database that provides an easy mongob-like interface to the data with first class typescript support.
Data persistance can be archieved by using storage providers which save the data through a JSON interface to placed such as localStorage.

Support for replicating data with remote storages is planned, but not yet implemented.
However, there will be a storage provider for RxDB that will take over the replication.

## Installation

````
  $ npm install signaldb
````

## Usage

*SignalDB is beeing developed right now is still very far from being fully implemented. Once there is a first version to test, you'll find the documentation here.*

## Architecture

### Reactivity

SignalDB uses the primitives of signals to provide reactivity. We want to keep dependencies small and don't lock-in to a specific framework. SignalDB works with the signal library of your choice. We've written adapters for all popular ones. If you thinnk there is a adapter missing, you can file an issue or provide a Pull Request and add it by yourself.

### Collections & Queries

SignalDB holds all data in memory to provide blazing fast query performance. This also allows it to have a synchronous api. Thanks to that, you don't have to care about asynchronous operations while working with your data.

### Data Persistance

SignalDB provides an interface were data can be persisted. It works by loading and saving the documents inside to an external system. Reads and writes are triggered by events from both directions.
The most simple and default persistance interface is `localStorage`, were data will be loaded and saved from `window.localStorage`. However, since all data lays in memory, data persistance is totally optional and only needed if you want to keep your data across page loads.

### Replication

It's planned to implement a data replication engine based on the paradigms used by then [replication protocol of RxDB](https://rxdb.info/replication.html) ([more info](https://github.com/pubkey/rxdb/issues/3883)).
In the first version we offer data replication by just implementing a persistance interface for RxDB and the replication will be handled inside RxDB.

## License
Licensed under MIT license. Copyright (c) 2023 Max Nowack

## Contributions
Contributions are welcome. Please open issues and/or file Pull Requests.

## Maintainers
- Max Nowack ([maxnowack](https://github.com/maxnowack))
