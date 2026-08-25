# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* Switched to new `StorageAdapter` API.
* Removed compatibility with `@signaldb/core` versions below `2.0.0`.

### Fixed

* Queries on an indexed field that is not a string now return the right documents. The index was keyed by IndexedDB's own keys — the raw values — while SignalDB looks an index up by `serializeValue(value)`, so `{ rank: 3 }` matched nothing and `{ rank: { $ne: 3 } }` matched everything. Only string-valued fields were unaffected, which is why the existing tests did not catch it.

## [1.1.0] - 2025-05-08

### Fixed


### Added

* Added support for custom database prefix option (thanks to @pierissimo!)

## [1.0.0] - 2025-01-06

* Initial release
