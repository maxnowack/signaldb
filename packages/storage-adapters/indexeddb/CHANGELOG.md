# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* Switched to new `StorageAdapter` API.
* **One database now holds every collection, and the adapter is configured accordingly.** `createIndexedDBAdapter('posts')` used to open a database of its own per collection (`signaldb-posts`, single store `items`). It now takes a description of one database — `databaseName`, `version` and a `schema` mapping each store name to the fields to index — and returns the `storage` function a data adapter asks for a collection's store. Stores present in the database but absent from `schema` are dropped on upgrade, so the schema is the complete description of what the database holds. The old per-collection databases are untouched and unread: open them yourself once and insert their contents if you need to keep the data.
* Removed compatibility with `@signaldb/core` versions below `2.0.0`.

### Fixed

* Queries on an indexed field that is not a string now return the right documents. The index was keyed by IndexedDB's own keys — the raw values — while SignalDB looks an index up by `serializeValue(value)`, so `{ rank: 3 }` matched nothing and `{ rank: { $ne: 3 } }` matched everything. Only string-valued fields were unaffected, which is why the existing tests did not catch it.

## [1.1.0] - 2025-05-08

### Fixed


### Added

* Added support for custom database prefix option (thanks to @pierissimo!)

## [1.0.0] - 2025-01-06

* Initial release
