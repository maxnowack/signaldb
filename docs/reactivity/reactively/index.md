---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/reactively/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reactivity/reactively/
- - meta
  - name: og:title
    content: SignalDB Reactivity Adapter for @reactively/core
- - meta
  - name: og:description
    content: Discover how to integrate SignalDB with `@reactively/core` using the Reactivity Adapter. Learn about installation, usage, and handling reactivity in your application.
- - meta
  - name: description
    content: Discover how to integrate SignalDB with `@reactively/core` using the Reactivity Adapter. Learn about installation, usage, and handling reactivity in your application.
- - meta
  - name: keywords
    content: SignalDB, Reactively, reactivity adapter, integration guide, JavaScript, TypeScript, reactive programming, SignalDB plugin, collection setup, reactive scope
---
# Reactivity adapter for [`@reactively/core`](https://github.com/modderme123/reactively)

## Adapter

* ✅ Automatic Cleanup
* ❌ Scope check

The API of Reactively doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

## Installation

```bash
  $ npm install signaldb-plugin-reactively
```

## Usage

```js
import { reactive } from '@reactively/core'
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-reactively'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

reactive(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
