# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* `StorageAdapter.readIndex` now declares `Map<string | null, Set<I>>` instead of `Map<any, Set<I>>`. The keys always had to be `serializeValue(value)` — that is what SignalDB looks an index up with — but the type did not say so, and an adapter keying its index by the raw field value answered nothing for every non-string field and everything for a `$ne` on one. If your adapter stores raw keys, wrap them in `serializeValue` from `@signaldb/core`.
* The `insert`, `insertMany`, `updateOne`, `updateMany`, `replaceOne`, `removeOne` and `removeMany` methods on the `Collection` are now asynchronous. They resolve to what they always returned: `insert` to the new item's id, `insertMany` to the new ids, `updateOne`, `replaceOne` and `removeOne` to `0` or `1`, and `updateMany` and `removeMany` to the number of items they touched. Await them — a rejected write that nobody awaits, a failed validation for instance, surfaces as an unhandled rejection instead of reaching your error handling.
* The `createMemoryAdapter` method and `MemoryAdapter` type were removed.
* The `memory` option for a `Collection` was removed.
* The `AutoFetchCollection` was removed. Use the `AutoFetchDataAdapter` instead.
* `isLoading` on the `Collection` now is initially `false` and will be set to `true` when the `persistence.pullStarted` event is emitted.
* Indices on a `Collection` are now specified as an array of strings instead of using `IndexProvider` or `LowLevelIndexProvider` instances.
* `PersistenceAdapter` was renamed to `StorageAdapter` and the signature was changed in a non backward compatible way.
* The error messages that named the old concept were renamed with it: `No persistence adapter for collection <name>` is now `No storage adapter for collection <name>`, and the `console.error` for a failed background write says `Error during storage operation in collection <name>`. If you match on either string — in a test, a log filter, or an error reporter's grouping rule — update it.
* The `createPersistenceAdapter` method was renamed to `createStorageAdapter`.
* The `combinePersistenceAdapters` method was removed.
* All persistence events on the `Collection` were removed.
* Exports for `createIndexProvider` and `createIndex` were removed. Specify indices as strings instead.
* `.isReady()` method on `Collection` was renamed to `.ready()`. A new reactive `.isReady` method was added to check if the collection is ready in a reactive way.
* Observing a query now reports the *minimal* set of `movedBefore` events for a reordering. In v1, every item whose neighbouring item had changed was reported as moved, so moving a single item could produce a `movedBefore` for several of them. Applying the reported moves still produces the same order, but consumers that count `movedBefore` calls, or that rely on being notified about items which did not themselves move, will now see fewer events.

### Added

* Introduced support to use a `DataAdapter` with a `Collection` to handle data operations in a more structured way.
* Added `DefaultDataAdapter` which provides a basic and backward compatible implementation of the `DataAdapter` interface.
* Added `AsyncDataAdapter` which provides an asynchronous implementation of the `DataAdapter` interface.
* Added `WorkerDataAdapter` and `WorkerDataAdapterHost` which provides a `DataAdapter` implementation that runs in a web worker.
* Added `isBatchOperationInProgress` method to `Collection` to check if a batch operation is currently in progress.
* The callback passed to `onQueryStateChange` on a `CollectionBackend` may now receive a second argument describing how the query result changed. Existing callbacks are unaffected — the argument is only passed when the adapter can produce it, and adapters that cannot simply omit it.
* `CollectionBackend`, `QueryOptions`, `StateChangeCallback` and `QueryDelta` are now exported, so a custom `DataAdapter` can name the types it has to implement.
* `Collection.batch` accepts the collections to batch: `Collection.batch([a, b], () => …)`. Without them it still batches every collection in the process, which defers every live query everywhere until the batch ends — fine for a few writes belonging to one event, and harmful around a loop whose length is data-dependent.
* Added `Collection.reportLargeQueries(rows)`, which reports each live query holding more than `rows` rows once, together with the stack that registered it. `enableDebugMode()` switches it on at 500 rows. A reactive query registered from a long-lived place keeps its cost for the lifetime of the application, and there is otherwise nothing to see: the query works, and its price only shows up as an application that has grown slow.

### Changed

* A write is now propagated to live queries as a description of what changed, instead of by re-running each affected query and comparing its new result against the previous one. A write that touches one item costs the size of that change rather than the size of every result on screen.
* `WorkerDataAdapterHost` sends the full result only the first time a query is answered; every update after that carries just the change. Editing one field of one row no longer serialises the entire result set across the worker boundary.
* `WorkerDataAdapter` answers `isReady()` from the promise it already started when the collection registered, instead of asking the worker again every time. Readiness happens once and never goes back, but each question used to cost a round trip — and callers ask often: a helper awaiting `ready()` before touching each record turned a thousand-record sync into a thousand extra messages.
* `DefaultDataAdapter`, `AsyncDataAdapter` and `WorkerDataAdapterHost` bring a query's result up to date from its previous result where they can, instead of reading the whole collection back from storage on every write. Queries using `limit` or `skip`, and projected queries that are also sorted, still re-execute, because their previous result cannot answer the change on its own.
* `WorkerDataAdapter` routes every worker message through a single listener instead of adding one per query and per pending request. Previously each incoming message was offered to every listener in turn, and each of them re-serialised its own selector to decide the message was not for it.
* A write that leaves a query's result unchanged no longer notifies that query's observers at all, and no longer produces a message across the worker boundary.
* `WorkerDataAdapter` no longer shows a write before the worker confirms it when the item it modifies is known only through a projected query. Applying a modifier to a projected item produces something that is not the item, and a selector naming a projected-away field would no longer match it. The write itself is unaffected; it simply becomes visible when the worker answers rather than immediately.
* `updateOne`, `updateMany` and `replaceOne` no longer read the items back from the data layer before writing them. The write's own answer says what changed, and an empty answer is what turns an upsert into an insert. The read still happens when something is listening for `validate`, so a validator can still inspect an item — and refuse the write — before it happens.
* `changed` is no longer emitted for a write that matched nothing. It previously was, whenever the item had still existed at the moment it was read back.
* A query with a `limit` is now brought up to date from its own window where the window allows it, instead of always being re-executed against the store. A window losing one of its items still needs the store, because what fills the gap is something the window has never held.

### Fixed

* A query combining an indexed field with an `$or` no longer returns documents that do not match it. The `$or` branches were unioned with the ids the rest of the selector had already narrowed down to, rather than intersected with them, and the optimized selector came back empty — so nothing filtered the surplus out again. `find({ status: 'open', $or: [{ tag: 'a' }, { tag: 'b' }] })` returned every indexed document instead of those satisfying both halves. Only queries whose fields are all indexed were affected, so indexing more made it more likely, not less.
* No data adapter reads a whole collection out of storage any more to answer a query that selects several ids at once. `{ id: { $in: [...] } }` is now resolved through the storage adapter's `readIds`, like a single scalar `id` always was, so the query costs the ids it asks for instead of the size of the collection. **This applies to every `insert`**, which checks for existing ids exactly that way — inserting one item into a collection of 2,000 used to read all 2,000 back first. An application reported both: a ledger lookup and each of its writes taking seconds as its history grew. `DefaultDataAdapter`, `AsyncDataAdapter` and `AutoFetchDataAdapter` had the same restriction and were fixed with it.
* Fixed a bug in `WorkerDataAdapter` where a query going back to the `'active'` state discarded the result it was holding, leaving readers of that query with nothing to show until the recomputation landed.
* Fixed a bug in `WorkerDataAdapter` where a query using `fields` returned an empty result for as long as any write was in flight. Its stored items are projected, and they were being matched against the selector again — which no field the projection had dropped could satisfy.
* Fixed `WorkerDataAdapter` letting a failed `registerCollection`, `registerQuery` or `unregisterQuery` escape as an uncaught promise rejection — which a disposed collection produced every time a cursor was cleaned up after it. A query the worker cannot register is now published as failed, so it reaches the collection's `query.error` event instead of waiting forever on an empty result.

## [1.8.1] - 2026-03-17

### Fixed

* Filter out gone items when getting items from index. This fixes a bug where items that were removed from the collection but were still present in the index and lead to an exception when trying to get the item from the collection.

## [1.8.0] - 2026-03-13

### Added

* Introduced the `transformAll` option when creating a `Collection`. This allows you to define a function that transform items after they are retrieved from persistence, enabling the integration of data from other collections or external sources (thanks @signalize!)
* Added `Collection.resetData()` to clear in-memory state and reload data from the persistence adapter.

### Fixed

* Fixed a race condition in SyncManager.dispose() that could cause unhandled "Collection is disposed" errors during organization/context switches while sync operations were still in flight (thanks @shajan-journal!)

## [1.7.2] - 2026-01-07

### Changed

* Upgraded mingo dependency to v7

## [1.7.1] - 2025-08-25

### Fixed

* Fixed index info for `$or` queries with mixed indexed and non-indexed fields

## [1.7.0] - 2025-07-08

### Added

* Type safety for modifiers in `updateOne`, `updateMany`, and `replaceOne` methods

### Fixed

* Fixed a bug where nested array parts where not resolved correctly
* Removed non-working `$text` operator from query selector type
* Fixed function signature for `$where` operator

## [1.6.0] - 2025-05-12

### Added

* Introduced `primaryKeyGenerator`. A function that generates a unique ID for the item. If not provided, a default generator will be used (thanks @signalize!)

### Fixed

* Improve performance of checking id index
* Export `Cursor` type

### Changed

* Leverage null and undefined values for indexing

## [1.5.4] - 2025-05-02

### Fixed

* Fixed a bug where the index wasn't filtered correctly when it was outdated

## [1.5.3] - 2025-05-02

### Changed

* deep clone items before modifying them

## [1.5.2] - 2025-04-04

### Changed

* Export `DotNotation` and `GetType` types (thanks @maxfriedmann!)

## [1.5.1] - 2025-04-01

### Fixed

* Add missing scope check for internal signals

## [1.5.0] - 2025-03-26

### Added

* Introduce `validation` event to allow schema validation of items in collections.

## [1.4.0] - 2025-03-19

### Added

* Implemented `{ upsert: true }` option for `updateOne` and `updateMany` methods.
* Implemented `replaceOne` method.

### Changed

* Check for already existing ids in `updateMany`

### Fixed

* Fixed checking for existing ids in `updateOne` and `updateMany`. There was a bug that made it impossible to update the id of an item.

## [1.3.1] - 2025-02-19

### Changed

* Improved index query performance

## [1.3.0] - 2025-02-18

### Added

* Implement exclusion of specific items when querying indices (when a selector contains `$nin` or `$ne`)

### Fixed

* Emit `getItems` event on collections regardless of an index hit

### Removed

* Removed auto-loading of developer tools and moved the loading to the `@signaldb/devtools` package. To load the developer tools, you now need to import `@signaldb/devtools` somewhere in your frontend code. Make sure that it doesn't get imported when running your code in production mode.

## [1.2.4] - 2025-02-17

### Changed

* Improved type checking of selectors

## [1.2.3] - 2025-02-11

### Changed

* Replace EventTarget-based emitter with a native implementation (thanks @Jordan-Mysten)

## [1.2.2] - 2025-02-03

### Fixed

* Fixed check if `@signaldb/devtools` package is available for some environments (addition to [#1359](https://github.com/maxnowack/signaldb/issues/1359))

## [1.2.1] - 2025-02-01

### Fixed

* Fixed a bug where the build environment was complaining about missing `@signaldb/devtools` package ([#1359](https://github.com/maxnowack/signaldb/issues/1359))

### Added

* Enabled type checking in query selectors

## [1.2.0] - 2025-01-13

### Added

* `isReady` method on `Collection` to wait for the collection to be ready

### Changed

* Don't load developer tools automatically in production (thanks @lorof)

## [1.1.0] - 2025-01-10

### Added

* Support for @signaldb/devtools
* Allow specifying a name for a collection
* Added `Collections.onCreation` method to listen for collection creation
* Added `Collections.onDispose` method to listen for collection disposal
* Added `Collections.getCollections` method to get all collections

### Changed
* Switched from native EventEmitter to custom class that is based on EventTarget
* Remove all listeners when disposing a collection

## [1.0.0] - 2024-12-16

### Added

* Added JSDoc comments to all public APIs
* Added method to globally configure field tracking
* Added method for configuring field tracking on a collection
* Allow configuring field tracking in collection options

### Removed

* BREAKING: `createLocalStorageAdapter` was moved to `@signaldb/localstorage`
* BREAKING: `createOPFSAdapter` was moved to `@signaldb/opfs`
* BREAKING: `createFilesystemAdapter` was moved to `@signaldb/fs`
* BREAKING: `PersistentCollection` was removed entirely
* BREAKING: `SyncManager` was moved to `@signaldb/sync`
* BREAKING: `ReplicatedCollection` was removed entirely
* BREAKING: `options` parameter was removed from `combinePersistenceAdapters`
* BREAKING: support for old `IndexProviders` was removed
