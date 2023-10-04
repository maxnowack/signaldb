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

The `create` function creates a new reactive dependency. A `Dependency` object must have at least these two methods:

* `depend()`: This method is called when the collection data is read, marking the place in the code as dependent on the collection data. Subsequent changes to the collection data will cause this place to be re-evaluated.
* `notify()`: This method is called when the collection data changes, notifying all dependent parts of the code that they need to re-evaluate.

You can also include more methods or other data in the dependency which you can access from the [`onDispose`](/reactivity/other/#ondispose-callback-void-dependency-dependency) method.

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

### `isInScope(dependency: Dependency): boolean`

The `isInScope` function is used for checking wether a SignalDB is in a reactive context. If SignalDB is not in a reactive context, reactivity will be automatically disabled to avoid memory leaks.

```js
isInScope() {
  return !!getScope()
}
```


### `onDispose(callback: () -> void, dependency: Dependency)`

This method is used to register a callback to be executed when the reactive computation is disposed. The dependency created in the [`create`](/reactivity/other/#create-dependency) method, will be passed as the second parameter. This can be useful if a framework requires data from the creation on disposal.

```js
onDispose: (callback, dependency) => {
  onDispose(callback)
}
```

The above methods are what you need to implement to provide a basic reactivity system to your collection.

Here's a complete example of a reactivity adapter:

```js
import { signal, peek, onDispose } from '@maverick-js/signals'
import { createReactivityAdapter } from 'signaldb'

const reactivity = createReactivityAdapter({
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
})

export default reactivity
```

Once the `reactivity` object is created, you can use it as the `reactivity` option when creating a new Collection. This will provide the collection with reactivity capabilities.
