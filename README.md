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

SignalDB is an innovative client-side database designed for modern web applications. It provides a powerful MongoDB-like interface that simplifies data handling with first-class TypeScript support, enhancing type safety and development experience. This JavaScript database is tailored for creating an optimistic UI, allowing developers to build responsive and dynamic user interfaces with ease.

Data persistence is a core feature of SignalDB. It enables the storage of data through a JSON interface in various storage providers, including the widely-used localStorage. This flexibility allows you to choose the most suitable storage mechanism for your application, whether you're aiming for temporary session storage or more permanent data retention.

SignalDB excels in situations where quick and efficient data handling is crucial. The use of a client-side approach ensures that data is readily available without the latency associated with server-side databases. This instant access to data is particularly beneficial for applications requiring high performance and real-time interactions.

Furthermore, SignalDB's architecture is designed to be lightweight and unobtrusive. It doesn't lock you into a specific framework, making it a versatile choice for a wide range of JavaScript applications. Whether you're working on a small project or a large-scale application, SignalDB's intuitive API and flexible design make it an ideal choice for developers looking to enhance their application's data management capabilities.

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
* **@preact/signals-core**
* **@reactively/core**
* **Angular**
* **Maverick-js Signals**
* **Meteor Tracker**
* **MobX**
* **oby**
* **S.js**
* **sinuous**
* **Solid.js**
* **usignal**
* **Vue.js**
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
Licensed under MIT license. Copyright (c) 2023 Max Nowack

## Contributions
Contributions are welcome. Please open issues and/or file Pull Requests.

## Maintainers
- Max Nowack ([maxnowack](https://github.com/maxnowack))
