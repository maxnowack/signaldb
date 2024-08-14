---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/preact-signals/
---
# Reactivity adapter for [`@preact/signals`](https://preactjs.com/blog/introducing-signals/)

Signals in Preact are designed to provide an efficient way of expressing and managing state, ensuring that applications remain performant irrespective of their complexity. When integrated with SignalDB, these signals can be used to seamlessly synchronize and react to changes in the database. This means that when a signal's value changes in the Preact component, it can automatically reflect the changes in the SignalDB database, and vice versa. This integration provides developers with a streamlined approach to building dynamic, data-driven applications. By combining the reactive principles of Preact signals with the robust capabilities of SignalDB, developers can achieve real-time data updates, ensuring that the user interface is always in sync with the underlying database. This seamless integration not only simplifies state management but also enhances the overall user experience by providing instant feedback and reducing the need for manual data refreshes.

## Adapter

* ❌ Automatic Cleanup
* ❌ Scope check

The API of Preact doesn't allow [automatic cleanup](/reactivity/other/#ondispose-callback-void-dependency-dependency) nor [reactive scope checking](/reactivity/other/#isinscope-dependency-dependency-boolean).
With Preact Signals, you can return a function from your `effect` that will be called on cleanup. Use this one to cleanup your cursors (see below for an example).
You also must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

## Installation

```bash
  $ npm install signaldb-plugin-preact
```

## Usage

```js
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-preact'
import { effect } from '@preact/signals-core'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect(() => {
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
  return () => {
    // @preact/signals doesn't allow to do automatic cleanup, so we have to do it ourself
    cursor.cleanup()
  }
})
```
