---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/other/
---
# Custom Reactivity Adapters

If there isn't a reactivity adapter for your framework yet, you can request one by [filing an issue](https://github.com/maxnowack/signaldb/issues/new) or writing one at your own.
This is not a complex process as the interface you have to write is really simple.

A reactivity adapter is a simple object that provides a way for a collection to track dependencies and notify them when changes occur, thereby providing reactivity to your collection. In the provided code snippet, the reactivity object is an implementation of a reactivity adapter using the `@maverick-js/signals` library.

The ReactivityAdapter object has two methods:

### `create() -> Dependency`

The `create` function creates a new reactive dependency. A `Dependency` object has two methods:

* `depend()`: This method is called when the collection data is read, marking the place in the code as dependent on the collection data. Subsequent changes to the collection data will cause this place to be re-evaluated.
* `notify()`: This method is called when the collection data changes, notifying all dependent parts of the code that they need to re-evaluate.

```js
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
}
```


### `onDispose(callback: () -> void)`

This method is used to register a callback to be executed when the reactive computation is disposed.

```js
onDispose: (callback) => {
  onDispose(callback)
}
```

The above methods are what you need to implement to provide a basic reactivity system to your collection.

Here's a complete example of a reactivity adapter:

```js
import { signal, peek, onDispose } from '@maverick-js/signals'
import { createReactivityAdapter } from 'signaldb'

const reactivity: ReactivityAdapter = {
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

export default reactivity
```

Once the `reactivity` object is created, you can use it as the `reactivity` option when creating a new Collection. This will provide the collection with reactivity capabilities.
