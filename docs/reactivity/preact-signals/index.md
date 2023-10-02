---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/preact-signals/
---
# Reactivity adapter for [`@preact/signals`](https://preactjs.com/blog/introducing-signals/)

## Adapter

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
