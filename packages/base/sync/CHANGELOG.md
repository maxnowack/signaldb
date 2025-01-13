# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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
