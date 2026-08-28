# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

* Importing this package calls `Collection.enableDebugMode()`, which in `@signaldb/core` v2 also switches on `Collection.reportLargeQueries()` at 500 rows. You will therefore see console output naming each live query that holds more than 500 rows, together with the stack that registered it. That report is the point — such a query keeps its cost for the lifetime of the application and is otherwise invisible — but it is new output where there was none. Call `Collection.reportLargeQueries(null)` after the import to switch it off, or a different number to pick your own threshold.

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
