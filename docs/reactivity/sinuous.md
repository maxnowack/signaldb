# Reactivity adapter for `sinuous`

## Adapter

```js
import { observable, api } from 'sinuous'
import type { ReactivityAdapter } from 'signaldb'

const reactivityAdapter: ReactivityAdapter = {
  create: () => {
    const dep = observable(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep(api.sample(() => dep()) + 1)
      },
    }
  },
  onDispose: (callback) => {
    api.cleanup(callback)
  },
}
```

## Usage

```js
import { api } from 'sinuous'
import { Collection } from 'signaldb'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

api.subscribe(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
