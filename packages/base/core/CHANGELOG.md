# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
