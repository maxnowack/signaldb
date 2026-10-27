# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.0.0] - 2026-10-27

### Changed

* Importing this package calls `Collection.enableDebugMode()`, which in `@signaldb/core` v2 also switches on `Collection.reportLargeQueries()` at 500 rows. You will therefore see console output naming each live query that holds more than 500 rows, together with the stack that registered it. That report is the point — such a query keeps its cost for the lifetime of the application and is otherwise invisible — but it is new output where there was none. Call `Collection.reportLargeQueries(null)` after the import to switch it off, or a different number to pick your own threshold.
* `react` and `react-dom` are now required at `^19.3.0` instead of `^19.2.3`, and `styled-components` at `^6.5.3` instead of `^6.2.0`. An application that pins older versions has to update them, or it ends up with a second copy of each in its bundle.

### Fixed

* `import '@signaldb/devtools'` is no longer removed by bundlers. The package declared `"sideEffects": false`, although importing it is the only way to use it, so a bundler that honours the flag — esbuild, Rollup, webpack in production mode — dropped the import and the devtools never loaded.
* The Mutations tab now lists `replaceOne` calls, with the replacement document in the Modifier column. They were not recorded at all before.
* The Data tab works with `@signaldb/core` v2 again. It read the items from the collection's `memory` option, which v2 removed, and crashed the devtools as soon as a collection was selected. It now shows the collection through a live query, so it works with every data adapter — including the `AsyncDataAdapter` and the `WorkerDataAdapter` — and a write only costs the devtools the size of the change. While the tab shows a collection of more than 500 items, that query is itself reported by `Collection.reportLargeQueries()`.
* A test suite that loads the devtools under a DOM environment such as Vitest's `happy-dom` no longer fails at random with `TypeError: Failed to execute 'dispatchEvent' on 'EventTarget': parameter 1 is not of type 'Event'` while every test passes. The devtools delivered each change notification on a 10 ms timer, so a collection created, written or disposed at the end of a test file was announced after the test environment had been torn down. Notifications are now delivered as soon as the code that caused them has finished, so none is left pending when a test ends — and the devtools panel no longer lags 10 ms behind.

## [1.0.0-beta.4] - 2025-02-18

### Added

* Added logic to load developer tools to this package. To load the developer tools, you now need to import `@signaldb/devtools` somewhere in your frontend code. Make sure that it doesn't get imported when running your code in production mode.

## [1.0.0-beta.3] - 2025-01-23

### Changed

* Deactivate tracking queries, mutation and performance by default

## [1.0.0-beta.2] - 2025-01-13

### Fixed

* Fixed version range for `@signaldb/core` peer dependency

## [1.0.0-beta.1] - 2025-01-10

### Changed

* Improved tables in the UI

## [1.0.0-beta.0] - 2025-01-10
