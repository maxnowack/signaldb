---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/S/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reactivity/S/
- - meta
  - name: og:title
    content: SignalDB Reactivity Adapter for S.js
- - meta
  - name: og:description
    content: Learn how to integrate SignalDB with the S.js reactivity library. This guide covers installation, usage, and how to handle scope limitations with S.js.
- - meta
  - name: description
    content: Learn how to integrate SignalDB with the S.js reactivity library. This guide covers installation, usage, and how to handle scope limitations with S.js.
- - meta
  - name: keywords
    content: SignalDB, S.js, reactivity adapter, integration guide, JavaScript, reactive scope, memory leaks, real-time updates, npm package, collection setup
---
# Reactivity adapter for [`S.js`](https://github.com/adamhaile/S)

## Adapter

* ✅ Automatic Cleanup
* ❌ Scope check

The API of S.js doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

## Installation

```bash
  $ npm install signaldb-plugin-sjs
```

## Usage

```js
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-sjs'
import S from 's-js'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

S(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
