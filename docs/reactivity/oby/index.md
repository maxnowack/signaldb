---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/oby/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reactivity/oby/
- - meta
  - name: og:title
    content: SignalDB Reactivity Adapter for oby
- - meta
  - name: og:description
    content: Discover how to integrate oby with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate oby with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, reactivity adapter, `oby`, JavaScript, TypeScript, integration guide, automatic cleanup, scope check, SignalDB plugin, real-time updates
---
# Reactivity adapter for [`oby`](https://github.com/vobyjs/oby)

## Adapter

* ✅ Automatic Cleanup
* ✅ Scope check

## Installation

```bash
  $ npm install signaldb-plugin-oby
```

## Usage

```js
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-oby'
import { effect } from 'oby'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
