# Reactivity adapter for `@maverick-js/signals`

## Adapter

```js
import { signal, peek, onDispose } from '@maverick-js/signals'
import type { ReactivityAdapter } from 'signaldb'

const reactivityAdapter: ReactivityAdapter = {
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
  onDispose: (callback) => {
    onDispose(callback)
  },
}
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
