---
title: 'Vue Signals: Reactivity Adapter for Vue.js'
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/vue/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/vue/
- - meta
  - name: og:title
    content: 'Vue Signals: SignalDB Reactivity Adapter for Vue.js'
- - meta
  - name: og:description
    content: Vue refs and computed work like signals. Learn how @signaldb/vue connects Vue reactivity to SignalDB for reactive database queries in watchEffect and computed.
- - meta
  - name: description
    content: Vue refs and computed work like signals. Learn how @signaldb/vue connects Vue reactivity to SignalDB for reactive database queries in watchEffect and computed.
- - meta
  - name: keywords
    content: SignalDB, Vue.js, reactivity adapter, integration guide, JavaScript, TypeScript, real-time updates, @signaldb/vue, watchEffect, component state, dynamic UI
---
# @signaldb/vue

**Does Vue have signals?** Yes. Vue's `ref()` and `computed()` are signals in everything but name: they hold a value, track who reads them, and trigger updates in `watchEffect()`, `computed()` and templates when the value changes. Vue's documentation describes refs as its equivalent of the signals found in Solid, Preact or Angular. For a general introduction, see [JavaScript Signals Explained](/signals/).

`@signaldb/vue` connects this reactivity system to SignalDB: queries on a SignalDB collection that run inside `watchEffect()` (or a `computed()`) become reactive and re-run whenever matching documents are inserted, updated or removed, locally or through [sync](/sync/).

## vueReactivityAdapter (`default`)

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import vueReactivityAdapter from '@signaldb/vue'
import { watchEffect } from 'vue'

const posts = new Collection('posts', new DefaultDataAdapter(), {
  reactivity: vueReactivityAdapter,
})

watchEffect((onCleanup) => {
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
  onCleanup(() => cursor.cleanup())
})
```

Reactivity adapter for usage with [Vue](https://vuejs.org/guide/essentials/reactivity-fundamentals.html).

::: info
The API of Vue doesn't allow [automatic cleanup](/reference/core/createreactivityadapter/#ondispose-callback-void-dependency-dependency-optional) nor [reactive scope checking](/reference/core/createreactivityadapter/#isinscope-dependency-dependency-boolean-optional).
In Vue, the function passed to the `watchEffect()` function gets a `onCleanup` callback that can be used to cleanup the effect. You have to use this to cleanup the cursor manually (see example above).

You also must manually disable reactivity when making calls outside your `watchEffect()` function to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).
:::

Vue.js is renowned for its powerful reactivity system, enabling developers to effortlessly bind and update the UI based on underlying data changes. Integrating Vue.js with signaldb, particularly with signals (often referred to as refs), is a fusion of two reactivity paradigms. Signals in Vue.js act as reactive reference pointers, and when their underlying values change, any dependent computation or rendering logic responds dynamically. Signaldb's reactivity adapter bridges the gap between Vue’s reactive ecosystem and the database layer. By leveraging this adapter, Vue.js developers can seamlessly synchronize their component state with signaldb collections, ensuring real-time data accuracy. If your Vue.js application doesn't currently implements a reactivity adapter for signaldb, it's straightforward to introduce one. This adapter ensures that dependencies are accurately tracked and efficiently notified when data mutations occur. Thus, integrating Vue.js with signaldb not only enhances the dynamic capabilities of your application but also enriches user experiences with instantaneous data reactivity.
