# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* Switched to new `StorageAdapter` API.
* **A collection is a folder now, not a file.** The driver is given a directory and writes one file per document under `items/` and one file per indexed value under `index/`, so a write costs one file rather than a rewrite of the whole collection. A driver written against the previous single-file interface has to be rewritten against `Driver`, which now describes path building, directory creation and recursive listing alongside reading and writing.
* Removed compatibility with `@signaldb/core` versions below `2.0.0`

### Fixed

* Custom deserialize function now works correctly when file is empty (thanks to @krolebord!)

## [1.0.1] - 2025-04-24

### Fixed

* Avoid duplicate ids and unnecessary errors

## [1.0.0] - 2024-12-16

### Added

* Added JSDoc comments to public API
