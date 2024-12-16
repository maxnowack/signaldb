<p align="center">
  <a href="#">
    <img src="/docs/public/logo.svg" width="150px" alt="SignalDB Logo" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/maxnowack/signaldb/releases"><img src="https://img.shields.io/github/v/release/maxnowack/signaldb?include_prereleases&label=version&sort=semver" alt="Current Version" /></a>
  <a href="https://github.com/maxnowack/signaldb/actions"><img src="https://img.shields.io/github/checks-status/maxnowack/signaldb/main" alt="Status Checks" /></a>
  <img src="https://img.shields.io/npm/types/signaldb" alt="TypeScript" />
  <a href="https://app.codecov.io/gh/maxnowack/signaldb"><img src="https://img.shields.io/codecov/c/github/maxnowack/signaldb" alt="Coverage" /></a>
  <a href="https://github.com/maxnowack/signaldb/blob/main/LICENSE"><img src="https://img.shields.io/github/license/maxnowack/signaldb" alt="License" /></a>
  <a href="https://github.com/maxnowack/signaldb/stargazers"><img src="https://img.shields.io/github/stars/maxnowack/signaldb" alt="Stargazers" /></a>
</p>

<p align="center">
   <a href="https://signaldb.js.org/getting-started/">Getting Started</a> |
   <a href="https://signaldb.js.org/reference/">Reference</a>
<p>

# SignalDB

SignalDB is a client-side database optimized for modern web applications. It provides an optimistic UI for creating responsive and dynamic interfaces, a MongoDB-like interface for familiarity, and robust TypeScript support to ensure type safety and accelerate development. SignalDB enables versatile local data persistence with support for various storage providers and facilitates real-time updates by gathering and synchronizing data from multiple sources. Its framework-agnostic design makes it suitable for projects of any scale, offering instant data access with minimal latency, which is ideal for applications requiring fast data handling and real-time interactions. Adapters are available for popular reactive libraries, including [Angular](https://signaldb.js.org/guides/angular/), [React](https://signaldb.js.org/guides/react/), [Solid](https://signaldb.js.org/guides/solid-js/), [Svelte](https://signaldb.js.org/guides/svelte/) and [Vue.js](https://signaldb.js.org/guides/vue/).

## Installation

````
  $ npm install @signaldb/core
````

## Usage

```js
import { Collection } from '@signaldb/core'

const Posts = new Collection()
const postId = Posts.insert({ title: 'Foo', text: 'Lorem ipsum …' })

Posts.updateOne({ id: postId }, { // updates the post
  $set: {
    title: 'New title',
  }
})

Posts.removeOne({ id: postId }) // removes the post

const cursor = collection.find({})

// returns an array with all documents in the collection
// reruns automatically in a reactive context
console.log(cursor.fetch())
```

See the [documentation](https://signaldb.js.org/) for more information.

## License
Licensed under MIT license. Copyright (c) 2024 Max Nowack

## Contributions
Contributions are welcome. Please open issues and/or file Pull Requests.
See [Contributing.md](https://github.com/maxnowack/signaldb/blob/main/CONTRIBUTING.md) to get started.

## Troubleshooting

If you encounter any issues, there are several ways to get support.
- Join our [Discord server](https://discord.gg/MB4ZGJX7).
- [Start a discussion](https://github.com/maxnowack/signaldb/discussions/new/choose)
- [Open an issue](https://github.com/maxnowack/signaldb/issues/new)
