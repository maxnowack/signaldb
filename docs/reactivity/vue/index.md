---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/vue/
---
# Reactivity adapter for [`Vue.js`](https://vuejs.org/guide/essentials/reactivity-fundamentals.html)

Vue.js is renowned for its powerful reactivity system, enabling developers to effortlessly bind and update the UI based on underlying data changes. Integrating Vue.js with signaldb, particularly with signals (often referred to as refs), is a fusion of two reactivity paradigms. Signals in Vue.js act as reactive reference pointers, and when their underlying values change, any dependent computation or rendering logic responds dynamically. Signaldb's reactivity adapter bridges the gap between Vue’s reactive ecosystem and the database layer. By leveraging this adapter, Vue.js developers can seamlessly synchronize their component state with signaldb collections, ensuring real-time data accuracy. If your Vue.js application doesn't currently implements a reactivity adapter for signaldb, it's straightforward to introduce one. This adapter ensures that dependencies are accurately tracked and efficiently notified when data mutations occur. Thus, integrating Vue.js with signaldb not only enhances the dynamic capabilities of your application but also enriches user experiences with instantaneous data reactivity.

## Adapter

* ✅ Automatic Cleanup
* ❌ Scope check

The API of Vue.js doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

```bash
  $ npm install signaldb-plugin-vue
```

## Usage

```js
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-vue'
import { watchEffect } from 'vue'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

watchEffect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
