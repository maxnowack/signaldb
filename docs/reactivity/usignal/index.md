---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/usignal/
---
# Reactivity adapter for [`usignal`](https://github.com/WebReflection/usignal)

## Adapter

* 🚧 Experimental
* ❌ Automatic Cleanup 
* ❌ Scope check

The API of usignal doesn't allow [automatic cleanup nor reactive scope checking](/reactivity/#reactivity-libraries). Adapters without automatic cleanup are considered as **experimental**, as a manual cleanup isn't really convenient and a not properly cleanup can lead to memory leaks.

```js
import { signal } from 'usignal'
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
