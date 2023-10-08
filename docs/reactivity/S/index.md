---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/S/
---
# Reactivity adapter for [`S.js`](https://github.com/adamhaile/S)

## Adapter

* ✅ Automatic Cleanup 
* ❌ Scope check

The API of S.js doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `reactive: false` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

```js
import S from 's-js'
import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = S.data(true)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep(true)
      },
    }
  },
  onDispose: (callback) => {
    S.cleanup(callback)
  },
})
```

## Usage

```js
import { Collection } from 'signaldb'
import S from 's-js'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

S(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
