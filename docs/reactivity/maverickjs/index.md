---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/maverickjs/
---
# Reactivity adapter for [`@maverick-js/signals`](https://github.com/maverick-js/signals)

## Adapter

```js
import { signal, peek, onDispose, getScope } from '@maverick-js/signals'
import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = signal(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep.set(peek(() => dep() + 1))
      },
    }
  },
  isInScope: () => !!getScope(),
  onDispose: (callback) => {
    onDispose(callback)
  },
})
```

## Usage

```js
import { effect } from '@maverick-js/signals'
import { Collection } from 'signaldb'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
