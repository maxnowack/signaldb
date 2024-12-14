---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/mobx/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/mobx/
- - meta
  - name: og:title
    content: '@signaldb/mobx - SignalDB Reactivity Adapter for MobX'
- - meta
  - name: og:description
    content: Discover how to integrate MobX with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate MobX with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, MobX, reactivity adapter, state management, real-time updates, observables, JavaScript, TypeScript, MobX integration, SignalDB collections, dynamic reactivity
---
# @signaldb/mobx

## mobxReactivityAdapter (`default`)

```js
import { Collection } from '@signaldb/core'
import mobxReactivityAdapter from '@signaldb/mobx'
import { autorun } from 'mobx'

const posts = new Collection({
  reactivity: mobxReactivityAdapter,
})

autorun(() => {
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
})
```

Reactivity adapter for usage with [MobX](https://mobx.js.org/).

The API of MobX doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

Integrating signals (or observables) in MobX with signaldb has revolutionized the way state management operates in modern applications. MobX, renowned for its effortless state management capabilities, transparently implements functional reactive programming. Through the use of a MobX reactivity adapter for signaldb, developers can harness the powerful reactivity mechanisms of MobX within the database context of signaldb. When you marry the dynamic, auto-updating nature of MobX observables with signaldb collections, you cultivate an environment where state and data persistency harmoniously coexist. Especially in scenarios where real-time data updates are crucial, this combination ensures that all dependent parts of your codebase are notified and updated whenever underlying data changes. Furthermore, the adaptability of MobX means that it seamlessly meshes with various frameworks, including the versatile signaldb. As the landscape of web development shifts towards more reactive paradigms, integrating MobX with signaldb emerges as a compelling solution for developers seeking efficient, boilerplate-free state management synchronized with a dependable database. If your framework still lacks a reactivity adapter, consider the value addition of integrating MobX and its unparalleled reactivity system into your tech stack.
