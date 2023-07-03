# ExoDB

ExoDB is a client side database that provides an easy mongob-like interface to the data with first class typescript support.
Data persistance can be archieved by using storage providers which save the data through a JSON interface to placed such as localStorage.

Support for replicating data with remote storages is planned, but not yet implemented.
However, there will be a storage provider for RxDB that will take over the replication.

## Installation

````
  $ npm install exodb
````

## Usage

*ExoDB is beeing developed right now is still very far from being fully implemented. Once there is a first version to test, you'll find the documentation here.*

## Name

The name "ExoDB" is a combination of the words "Exo" and "DB", where "Exo" refers to "external" or "externalized" and "DB" stands for "database." The name is derived from the idea that ExoDB is a client-side database that allows you to externalize and manage data on the client side, rather than relying solely on a server-side database.

The term "Exo" is often used to indicate something that is outside or separate from a particular system or environment. In the context of ExoDB, it suggests that the database is designed to be used externally, specifically on the client side, rather than being tightly integrated with a server-side database.

Furthermore ExoDB is inspired by core concepts of [meteor](https://github.com/meteor/meteor). So I also wanted a name that emphasise this relation and is somewhat related to space context (e.g. exoplanets). 

## Architecture

### Reactivity

ExoDB uses a port of the [meteor tracker package](https://github.com/meteor/meteor/tree/devel/packages/tracker) to provide reactivity. We want to keep dependencies small and don't lock-in to a specific framework. Tracker has a very simple core concept to provide basic reactivity and is also easy to port (meteor implementation has ~650 loc written in es5).
It's planned to later build bridges to other reactivity frameworks such as MobX or rxjs.

### Collections & Queries

ExoDB holds all data in memory to provide blazing fast query performance. 

### Data Persistance

ExoDB provides an interface were data can be persisted. It works by loading and saving JSON data. Reads and writes are triggered by events from both directions.
The most simple and default persistance interface is `localStorage`, were data will be loaded and saved from `window.localStorage`. However, since all data lays in memory, data persistance is totally optional and only needed for offline functionality.

### Replication

It's planned to implement a data replication engine based on the paradigms used by then [replication protocol of RxDB](https://rxdb.info/replication.html) ([more info](https://github.com/pubkey/rxdb/issues/3883)).
In the first version we offer data replication by just implementing a persistance interface for RxDB and the replication will be handled inside RxDB.

## License
Licensed under MIT license. Copyright (c) 2023 Max Nowack

## Contributions
Contributions are welcome. Please open issues and/or file Pull Requests.

## Maintainers
- Max Nowack ([maxnowack](https://github.com/maxnowack))
