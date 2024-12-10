---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/usignal/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reactivity/usignal/
- - meta
  - name: og:title
    content: SignalDB Reactivity Adapter for µsignal
- - meta
  - name: og:description
    content: Discover how to integrate µsignal with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate µsignal with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, usignal, reactivity adapter, integration guide, JavaScript, TypeScript, manual cleanup, reactivity scope, @signaldb/usignal
---
# Reactivity adapter for [`µsignal`](https://github.com/WebReflection/usignal)

## Adapter

* ❌ Automatic Cleanup
* ❌ Scope check

The API of usignal doesn't allow [automatic cleanup](/reference/core/createreactivityadapter/#ondispose-callback-void-dependency-dependency) nor [reactive scope checking](/reference/core/createreactivityadapter/#isinscope-dependency-dependency-boolean).
With usignal, you can return a function from your `effect` that will be called on cleanup. Use this one to cleanup your cursors (see below for an example).
You also must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

## Installation

```bash
  $ npm install @signaldb/usignal
```

## Usage

```js
import { Collection } from '@signaldb/core'
import reactivityAdapter from '@signaldb/usignal'
import { effect } from 'usignal'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect(() => {
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
  return () => {
    // usignal doesn't allow to do automatic cleanup, so we have to do it ourself
    cursor.cleanup()
  }
})
```
