---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/usignal/
---
# Reactivity adapter for [`usignal`](https://github.com/WebReflection/usignal)

## Adapter

* ❌ Automatic Cleanup
* ❌ Scope check

The API of usignal doesn't allow [automatic cleanup](/reactivity/other/#ondispose-callback-void-dependency-dependency) nor [reactive scope checking](/reactivity/other/#isinscope-dependency-dependency-boolean).
With usignal, you can return a function from your `effect` that will be called on cleanup. Use this one to cleanup your cursors (see below for an example).
You also must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

## Installation

```bash
  $ npm install signaldb-plugin-usignal
```

## Usage

```js
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-usignal'
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
