---
title: '@preact/signals-core: Reactivity Adapter for Preact Signals'
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/preact/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/preact/
- - meta
  - name: og:title
    content: '@preact/signals-core: SignalDB Reactivity Adapter for Preact Signals'
- - meta
  - name: og:description
    content: What @preact/signals-core is and how @signaldb/preact connects Preact Signals to SignalDB for reactive database queries in effect() and computed().
- - meta
  - name: description
    content: What @preact/signals-core is and how @signaldb/preact connects Preact Signals to SignalDB for reactive database queries in effect() and computed().
- - meta
  - name: keywords
    content: SignalDB, Preact, @preact/signals, reactivity adapter, real-time updates, JavaScript, state management, Preact integration, SignalDB plugin, data synchronization
---
# @signaldb/preact

**What is `@preact/signals-core`?** It is the framework-independent core of [Preact Signals](https://preactjs.com/guide/v10/signals/): a small library that provides `signal()`, `computed()`, `effect()` and `batch()`. It has no dependency on Preact and can be used in any JavaScript project. `@preact/signals` and `@preact/signals-react` build on it to integrate signals into Preact and React components. For a general introduction, see [JavaScript Signals Explained](/signals/).

`@signaldb/preact` connects `@preact/signals-core` to SignalDB: queries on a SignalDB collection that run inside an `effect()` or `computed()` become reactive and re-run whenever matching documents change, locally or through [sync](/sync/).

## preactReactivityAdapter (`default`)

```js
import { Collection } from '@signaldb/core'
import preactReactivityAdapter from '@signaldb/preact'
import { effect } from '@preact/signals-core'

const posts = new Collection({
  reactivity: preactReactivityAdapter,
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

Reactivity adapter for usage with [Preact Signals](https://preactjs.com/blog/introducing-signals/).

The API of Preact doesn't allow [automatic cleanup](/reference/core/createreactivityadapter/#ondispose-callback-void-dependency-dependency-optional) nor [reactive scope checking](/reference/core/createreactivityadapter/#isinscope-dependency-dependency-boolean-optional).
With Preact Signals, you can return a function from your `effect` that will be called on cleanup. Use this one to cleanup your cursors (see below for an example).
You also must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

Signals in Preact are designed to provide an efficient way of expressing and managing state, ensuring that applications remain performant irrespective of their complexity. When integrated with SignalDB, these signals can be used to seamlessly synchronize and react to changes in the database. This means that when a signal's value changes in the Preact component, it can automatically reflect the changes in the SignalDB database, and vice versa. This integration provides developers with a streamlined approach to building dynamic, data-driven applications. By combining the reactive principles of Preact signals with the robust capabilities of SignalDB, developers can achieve real-time data updates, ensuring that the user interface is always in sync with the underlying database. This seamless integration not only simplifies state management but also enhances the overall user experience by providing instant feedback and reducing the need for manual data refreshes.
