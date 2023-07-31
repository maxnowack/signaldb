---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/solidjs.html
---
# Reactivity adapter for [`solid-js`](https://www.solidjs.com/docs/latest)

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
