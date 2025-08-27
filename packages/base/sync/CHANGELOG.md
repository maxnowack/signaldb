# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* Removed compatibility with `@signaldb/core` versions below `2.0.0`
* Renamed `persistenceAdapter` option to `storageAdapter` in `SyncManager` constructor options.

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
