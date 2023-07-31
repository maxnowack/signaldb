---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/oby/
---
# Reactivity adapter for [`oby`](https://github.com/vobyjs/oby)

## Adapter

```js
import $oby, { untrack, cleanup } from 'oby'
import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = $oby(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep(untrack(() => dep() + 1))
      },
    }
  },
  onDispose: (callback) => {
    cleanup(callback)
  },
})
```

## Usage

```js
import { Collection } from 'signaldb'
import { effect } from 'oby'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
