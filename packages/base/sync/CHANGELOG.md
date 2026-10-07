# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* Removed compatibility with `@signaldb/core` versions below `2.0.0`
* Removed `persistenceAdapter` option from `SyncManager` constructor options. Use `dataAdapter` option instead.
* Without an `id`, the sync manager's own collections are now named `default-sync-manager-changes`, `default-sync-manager-snapshots` and `default-sync-manager-sync-operations`. They used to be named `undefined-changes` and so on, because the names were built from the `id` option rather than from its default. If you persisted the sync manager's data without setting `id`, the changes not yet pushed and the snapshots under the old names are no longer read: either set `id: 'undefined'` to keep the old names, or let the next sync rebuild the snapshots. With `@signaldb/indexeddb`, rename the stores in your `schema` accordingly.

### Added

* `isSyncing(name, true)` returns a `Promise<boolean>` and reads the active sync operations through an `{ async: true }` query. Use it when the sync manager's `dataAdapter` cannot answer a query on the spot, such as an `AsyncDataAdapter` or a `WorkerDataAdapter`. `isSyncing(name)` stays synchronous and reactive.

### Changed

* `addCollection` is generic over the item type of the collection passed to it, so a collection whose item type extends the sync manager's item type can be added without a cast.

### Fixed

* `sync()` rejects for a collection whose stored data could not be loaded, and `isReady()` rejects when the sync manager's own collections could not be loaded. Both used to proceed as if the data had been loaded, so a sync could compute its changes against an empty collection.
* `isReady()` resolves only once the sync manager's own collections are ready. It resolved immediately, so a sync could start before the stored changes and snapshots had been loaded.
* Remote changes delivered with data through `registerRemoteChange` are applied in the collection's sync queue. They could previously run at the same time as a sync of the same collection and interleave with it.

## [1.3.1] - 2025-04-29

### Fixed

* Fix `computeChanges` method to work with items that have null values

## [1.3.0] - 2025-04-24

### Added

* Added `rawChanges` array to `push` function parameters to make all changes available during push.
* Added `modifiedFields` to `changes` object on `push` to allow patch updates

## [1.2.2] - 2025-03-20

### Fixed

* Fix version for `@signaldb/core` dependency

## [1.2.1] - 2025-03-19

### Changed

* Use upserts in `updateOne` internally instead of searching for the document first

### Fixed

* Use `replaceOne` internally to replace documents in collections instead of just updating them with `updateOne`

## [1.2.0] - 2025-03-10

### Added

* Allow configuration of debounce time for pushing changes (thanks @augustpemberton!)

### Fixed

* Don't skip debounces when pushing multiple collections (#1470, thanks @augustpemberton!)

## [1.1.3] - 2025-02-19

### Changed

* Improved sync performance by reducing overhead in internal `applyChanges` method
* Improved sync performance by updating only changed documents when applying snapshots

## [1.1.2] - 2025-02-18

### Changed

* Add indices to internal collections to improve performance

## [1.1.1] - 2025-01-21

### Fixed

* Explicitly turn of reactivity for internal queries

## [1.1.0] - 2025-01-13

### Fixed

* Wait until collections persistence was initialized before starting sync

### Added

* Allow sync to be paused and resumed with `syncManager.startSync(name)` and `syncManager.pauseSync(name)` (thanks @obedm503)
* Added `syncManager.startAll()` and `syncManasger.pauseAll()` to start and pause all collections

## [1.0.1] - 2025-01-10

### Changed

* Define names for internal collections
* Dispose temporary collections in applyChanges function

## [1.0.0] - 2024-12-16

### Changed

* BREAKING: `SyncManager` does now default to **no persistence** instead of `localStorage`
