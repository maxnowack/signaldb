---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/sinuous/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reactivity/sinuous/
- - meta
  - name: og:title
    content: SignalDB Reactivity Adapter for Sinuous
- - meta
  - name: og:description
    content: Discover how to integrate Sinuous with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate Sinuous with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, Sinuous, reactivity adapter, integration guide, JavaScript, TypeScript, reactive programming, SignalDB plugin, collection setup, automatic cleanup, memory management
---
# Reactivity adapter for [`sinuous`](https://sinuous.netlify.app/)

## Adapter

* ✅ Automatic Cleanup
* ❌ Scope check

The API of Sinuous doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

## Installation

```bash
  $ npm install signaldb-plugin-sinuous
```

## Usage

```js
import { api } from 'sinuous'
import reactivityAdapter from 'signaldb-plugin-sinuous'
import { Collection } from 'signaldb'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

api.subscribe(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
