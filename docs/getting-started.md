---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/getting-started.html
---
# Getting Started

::: warning
Keep in mind, that SignalDB is in a very early stage and not yet production ready.
:::

Welcome to the Getting Started guide for SignalDB, a client-side database providing a seamless MongoDB-like interface with first-class TypeScript support. SignalDB is designed for blazing fast query performance and data persistence, while remaining framework-agnostic.

## Installation

Installing SignalDB is simple and easy. It can be installed using npm. Open your terminal and enter the following command:

```bash
  $ npm install signaldb
```

## Creating Collections

Creating collections is straight forward.

```js
import { Collection } from 'signaldb'

const posts = new Collection()
```

That's all you have to do. There a also some optional configuration options you find here: [collections reference](/collections)


## Adding data

After you've created you first collection, you can start to add documents to it.

```js
// ...

const postId = posts.insert({ title: 'Foo', text: 'Lorem ipsum …' })
```

You created your first document in SignalDB! Check out the [data manipulation](/data-manipulation) page to learn how to update and remove documents.

## Querying

Getting your documents back is also very easy.

```js
// ...

const cursor = collection.find({})
console.log(cursor.fetch()) // returns an array with all documents in the collection
```

You've finished the Getting Started Guide! The next steps are getting reactivity to work. Check out the [core concepts about reactivity](/core-concepts#signals-and-reactivity-adapters) to learn how to do this.
