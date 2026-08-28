# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### BREAKING CHANGES

* Switched to new `StorageAdapter` API.
* **The localStorage keys changed.** A collection used to live under `signaldb-collection-<name>`; it now lives under `<databaseName>-<name>`, defaulting to `signaldb-<name>`, with one further key per declared index. Data written by v1 is still in localStorage but is not read by v2 — read the old key yourself once and insert its contents into the collection, then remove it.
* Removed compatibility with `@signaldb/core` versions below `2.0.0`

### Fixed

* Custom deserialize function now works correctly when localStorage is empty (thanks to @krolebord!)

## [1.0.1] - 2025-04-24

### Fixed

* Avoid duplicate ids and unnecessary errors

## [1.0.0] - 2024-12-16

### Added

* Added JSDoc comments to public API
