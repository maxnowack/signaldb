# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* Switched to new `StorageAdapter` API.
* **The adapter is given a folder, not a file, and the on-disk layout changed with it.** `createFileSystemAdapter('data.json')` used to write one JSON file holding the whole collection; it now takes a directory and writes one file per document under `items/` — sharded over two levels by the document's id — and one file per indexed value under `index/`. A write therefore costs one file rather than a rewrite of the entire collection. Data written by v1 is not read by v2: point the adapter at a fresh directory and import your old JSON file into the collection once, or keep the old file and write a one-off migration that inserts its contents.
* Removed compatibility with `@signaldb/core` versions below `2.0.0`

### Fixed

* Custom deserialize function now works correctly when file is empty (thanks to @krolebord!)

## [1.0.1] - 2025-04-24

### Fixed

* Avoid duplicate ids and unnecessary errors

## [1.0.0] - 2024-12-16

### Added

* Added JSDoc comments to public API
