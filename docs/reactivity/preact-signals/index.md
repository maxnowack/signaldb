---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/preact-signals/
---
# Reactivity adapter for [`@preact/signals`](https://preactjs.com/blog/introducing-signals/)

Signals in Preact are designed to provide an efficient way of expressing and managing state, ensuring that applications remain performant irrespective of their complexity. When integrated with SignalDB, these signals can be used to seamlessly synchronize and react to changes in the database. This means that when a signal's value changes in the Preact component, it can automatically reflect the changes in the SignalDB database, and vice versa. This integration provides developers with a streamlined approach to building dynamic, data-driven applications. By combining the reactive principles of Preact signals with the robust capabilities of SignalDB, developers can achieve real-time data updates, ensuring that the user interface is always in sync with the underlying database. This seamless integration not only simplifies state management but also enhances the overall user experience by providing instant feedback and reducing the need for manual data refreshes.

## Adapter

* 🚧 Experimental
* ❌ Automatic Cleanup 
* ❌ Scope check

The API of Preact doesn't allow [automatic cleanup nor reactive scope checking](/reactivity/#reactivity-libraries). Adapters without automatic cleanup are considered as **experimental**, as a manual cleanup isn't really convenient and a not properly cleanup can lead to memory leaks.

```js
import { signal } from '@preact/signals-core'
import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = signal(0)
    return {
      depend: () => {
        // eslint-disable-next-line no-unused-expressions
        dep.value
      },
      notify: () => {
        dep.value = dep.peek() + 1
      },
    }
  },
})
```

## Usage

```js
import { Collection } from 'signaldb'
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
