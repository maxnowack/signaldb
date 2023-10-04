---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/mobx/
---
# Reactivity adapter for [`MobX`](https://mobx.js.org/)

Integrating signals (or observables) in MobX with signaldb has revolutionized the way state management operates in modern applications. MobX, renowned for its effortless state management capabilities, transparently implements functional reactive programming. Through the use of a MobX reactivity adapter for signaldb, developers can harness the powerful reactivity mechanisms of MobX within the database context of signaldb. When you marry the dynamic, auto-updating nature of MobX observables with signaldb collections, you cultivate an environment where state and data persistency harmoniously coexist. Especially in scenarios where real-time data updates are crucial, this combination ensures that all dependent parts of your codebase are notified and updated whenever underlying data changes. Furthermore, the adaptability of MobX means that it seamlessly meshes with various frameworks, including the versatile signaldb. As the landscape of web development shifts towards more reactive paradigms, integrating MobX with signaldb emerges as a compelling solution for developers seeking efficient, boilerplate-free state management synchronized with a dependable database. If your framework still lacks a reactivity adapter, consider the value addition of integrating MobX and its unparalleled reactivity system into your tech stack.

## Adapter

```js
import { observable, runInAction, onBecomeUnobserved } from 'mobx'
import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = observable({ count: 0 })
    return {
      depend: () => {
        dep.count
      },
      notify: () => {
        runInAction(() => {
          dep.count += 1
        })
      },
      raw: dep,
    }
  },
  onDispose(callback, { raw: dep }) {
    onBecomeUnobserved(dep, 'count', callback)
  },
})
```

## Usage

```js
import { Collection } from 'signaldb'
import { autorun } from 'mobx'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

autorun(() => {
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
})
```
