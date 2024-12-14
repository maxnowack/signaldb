---
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
    content: '@signaldb/vue - SignalDB Reactivity Adapter for Vue.js'
- - meta
  - name: og:description
    content: Discover how to integrate Vue.js with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate Vue.js with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, Vue.js, reactivity adapter, integration guide, JavaScript, TypeScript, real-time updates, @signaldb/vue, watchEffect, component state, dynamic UI
---
# @signaldb/vue

## vueReactivityAdapter (`default`)

```js
import { Collection } from '@signaldb/core'
import vueReactivityAdapter from '@signaldb/vue'
import { watchEffect } from 'vue'

const posts = new Collection({
  reactivity: vueReactivityAdapter,
})

watchEffect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```

Reactivity adapter for usage with [Vue](https://vuejs.org/guide/essentials/reactivity-fundamentals.html).

Vue.js is renowned for its powerful reactivity system, enabling developers to effortlessly bind and update the UI based on underlying data changes. Integrating Vue.js with signaldb, particularly with signals (often referred to as refs), is a fusion of two reactivity paradigms. Signals in Vue.js act as reactive reference pointers, and when their underlying values change, any dependent computation or rendering logic responds dynamically. Signaldb's reactivity adapter bridges the gap between Vue’s reactive ecosystem and the database layer. By leveraging this adapter, Vue.js developers can seamlessly synchronize their component state with signaldb collections, ensuring real-time data accuracy. If your Vue.js application doesn't currently implements a reactivity adapter for signaldb, it's straightforward to introduce one. This adapter ensures that dependencies are accurately tracked and efficiently notified when data mutations occur. Thus, integrating Vue.js with signaldb not only enhances the dynamic capabilities of your application but also enriches user experiences with instantaneous data reactivity.
