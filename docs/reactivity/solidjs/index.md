---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/solidjs/
---
# Reactivity adapter for [`solid-js`](https://www.solidjs.com/docs/latest)

Solid-js's integration with SignalDB leverages the power of Solid's reactive primitives to seamlessly connect with SignalDB's reactive local JavaScript database. Solid-js, known for its granular reactivity and efficient data management, provides a robust foundation for SignalDB to build upon. When using Solid-js, developers can effortlessly create and manage signals, which are core reactive primitives. These signals can then be integrated with SignalDB, allowing for real-time data updates and synchronization. This synergy between Solid-js and SignalDB ensures that developers can harness the full potential of both technologies, resulting in a more dynamic and responsive application. By utilizing Solid-js's automatic dependency tracking and SignalDB's MongoDB-like interface, developers can achieve a seamless flow of data, enhancing the overall user experience. In essence, the integration of Solid-js with SignalDB represents the convergence of two powerful technologies, offering developers a streamlined approach to building reactive applications.

## Adapter

```js
import { createSignal, onCleanup } from 'solid-js'
import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const [depend, rerun] = createSignal(undefined, { equals: false })
    return {
      depend: () => {
        depend()
      },
      notify: () => {
        rerun()
      },
    }
  },
  onDispose: (callback) => {
    onCleanup(callback)
  },
})
```

## Usage

```js
import { Collection } from 'signaldb'
import { createEffect } from 'solid-js'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

createEffect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
