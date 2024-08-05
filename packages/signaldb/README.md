<p align="center">
  <a href="#">
    <img src="./docs/public/logo.svg" width="150px" alt="JavaScript Database" />
  </a>
</p>

<p align="center">
  <a href="https://github.com/maxnowack/signaldb/releases"><img src="https://img.shields.io/github/v/release/maxnowack/signaldb?include_prereleases&label=version&sort=semver" alt="Current Version" /></a>
  <a href="https://github.com/maxnowack/signaldb/actions"><img src="https://img.shields.io/github/checks-status/maxnowack/signaldb/main" alt="Status Checks" /></a>
  <img src="https://img.shields.io/npm/types/signaldb" alt="TypeScript" />
  <a href="https://app.codecov.io/gh/maxnowack/signaldb"><img src="https://img.shields.io/codecov/c/github/maxnowack/signaldb" alt="Coverage" /></a>
  <a href="https://github.com/maxnowack/signaldb/blob/main/LICENSE"><img src="https://img.shields.io/github/license/maxnowack/signaldb" alt="License" /></a>
  <a href="https://github.com/maxnowack/signaldb/stargazers"><img src="https://img.shields.io/github/stars/maxnowack/signaldb" alt="Stargazers" /></a>
  <a href="https://www.npmjs.com/package/signaldb"><img src="https://img.shields.io/npm/dm/signaldb" alt="npm" /></a>
</p>

# SignalDB: Client-Side JavaScript Database with TypeScript Support and Reactive Interfaces

SignalDB is a client-side database optimized for modern web applications, offering a MongoDB-like interface with robust TypeScript support to improve development speed and ensure type safety. SignalDB supports creating an optimistic UI for responsive, dynamic interfaces and offers versatile local data persistence with various storage providers. SignalDB is also able to gather data from multiple sources, enabling real-time updates and synchronization (see examples for [AppWrite](https://github.com/maxnowack/signaldb/tree/main/examples/appwrite), [Firebase](https://github.com/maxnowack/signaldb/tree/main/examples/firebase), [Supabase](https://github.com/maxnowack/signaldb/tree/main/examples/supabase), [RxDB](https://github.com/maxnowack/signaldb/tree/main/examples/rxdb) and [HTTP](https://github.com/maxnowack/signaldb/tree/main/examples/replication-http)).
Designed for efficiency in applications requiring quick data handling and real-time interactions, SignalDB provides instant data access, minimizing latency typical of server-side databases. Its lightweight architecture is framework-agnostic, making it suitable for both small and large-scale projects that require flexible, intuitive data management solutions. SignalDB provides adapters for popular reactive libraries including [Angular](https://signaldb.js.org/reactivity/angular/), [React](https://signaldb.js.org/guides/react/) (through 3rd party signal libraries), [Solid.js](https://signaldb.js.org/reactivity/solidjs/), [Vue.js](https://signaldb.js.org/reactivity/vue/) and many more.

## Installation

````
  $ npm install signaldb
````

## Usage

```js
import { Collection } from 'signaldb'

const posts = new Collection()
const postId = posts.insert({ title: 'Foo', text: 'Lorem ipsum …' })
const cursor = collection.find({})
console.log(cursor.fetch()) // returns an array with all documents in the collection
```

### Reactivity
In theory, every signal library is supported. SignalDB currently have pre-build reactivity adapters for these libraries:
* [**@preact/signals-core**](https://signaldb.js.org/reactivity/preact-signals/)
* [**@reactively/core**](https://signaldb.js.org/reactivity/reactively/)
* [**Angular**](https://signaldb.js.org/reactivity/angular/)
* [**Maverick-js Signals**](https://signaldb.js.org/reactivity/maverickjs/) (current favorite for usage with React)
* [**Meteor Tracker**](https://signaldb.js.org/reactivity/meteor-tracker/)
* [**MobX**](https://signaldb.js.org/reactivity/mobx/)
* [**oby**](https://signaldb.js.org/reactivity/oby/)
* [**S.js**](https://signaldb.js.org/reactivity/s-js/)
* [**sinuous**](https://signaldb.js.org/reactivity/sinuous/)
* [**Solid.js**](https://signaldb.js.org/reactivity/solidjs/)
* [**usignal**](https://signaldb.js.org/reactivity/usignal/)
* [**Vue.js**](https://signaldb.js.org/reactivity/vue/)
* *and more to come!*

More information in the [reactivity section](https://signaldb.js.org/reactivity/) of the documentation.

```js
import { effect } from '@preact/signals-core'
// OR
import { effect } from '@angular/core'
// OR
import { autorun as effect } from 'mobx'
// OR
import { createEffect as effect } from 'solid-js'
// OR
import { watchEffect as effect } from 'vue'
// ...

const posts = new Collection({
  reactivity: /* ... */ // see https://signaldb.js.org/reactivity/ for reactivity adapters for your favorite library,
})

effect(() => { // will be executed everytime the query result changes
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
})

```

Please also take a look at the [documentation](https://signaldb.js.org)

## Architecture

### Reactivity

SignalDB harnesses the power of signal-based reactivity to offer a dynamic and responsive user experience. Our architecture integrates seamlessly with various signal libraries, ensuring compatibility and flexibility across different JavaScript frameworks. Whether you're using Angular, React, Vue.js, or others, SignalDB adapts to your preferred environment, enhancing the reactivity of your web applications.

### Collections & Queries

At the heart of SignalDB lies its advanced handling of collections and queries. Our in-memory data storage approach ensures blazing-fast query performance, perfect for applications requiring real-time data manipulation and retrieval. This setup allows for a synchronous API, eliminating the complexity of asynchronous operations and making data handling straightforward and efficient.

### Data Persistance

SignalDB's data persistence layer is designed for scalability and flexibility. It offers various strategies for persisting data, from simple `localStorage` implementations to more complex external systems. This versatility allows for customization based on your application's needs, ensuring data is stored efficiently and securely. Our architecture supports the evolution of your application, providing a solid foundation for growth and expansion.

### Replication

Looking ahead, SignalDB plans to implement a cutting-edge data replication engine, drawing inspiration from established protocols like the [RxDB replication protocol](https://rxdb.info/replication.html) ([more info](https://github.com/pubkey/rxdb/issues/3883)). Initially, we'll offer data replication through a persistence interface for RxDB, with further expansions to follow. Our commitment to extensibility means that we're continually evolving, adding new features and capabilities to meet the ever-changing demands of modern web development.

## License
Licensed under MIT license. Copyright (c) 2024 Max Nowack

## Contributions
Contributions are welcome. Please open issues and/or file Pull Requests.

## Maintainers
- Max Nowack ([maxnowack](https://github.com/maxnowack))
