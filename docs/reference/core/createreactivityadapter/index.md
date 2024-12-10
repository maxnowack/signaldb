---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/createreactivityadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/createreactivityadapter/
- - meta
  - name: og:title
    content: Custom Reactivity Adapters for SignalDB
- - meta
  - name: og:description
    content: Learn how to create custom reactivity adapters for SignalDB. This guide provides an overview of the reactivity adapter interface and includes code examples.
- - meta
  - name: description
    content: Learn how to create custom reactivity adapters for SignalDB. This guide provides an overview of the reactivity adapter interface and includes code examples.
- - meta
  - name: keywords
    content: SignalDB, reactivity adapters, custom reactivity, JavaScript, TypeScript, @maverick-js/signals, dependency management, reactive programming, SignalDB adapter
---
# createReactivityAdapter

```ts
import { createReactivityAdapter } from '@signaldb/core'
```

A reactivity adapter is a simple object that provides a way for a collection to track dependencies and notify them when changes occur, thereby providing reactivity to your collection. The following code snippets demonstrate the implementation of a reactivity adapter using the `@maverick-js/signals` library.

A ReactivityAdapter object can have the following methods.

### `create() -> Dependency`

The `create` function creates a new reactive dependency. A `Dependency` object must have at least these two methods:

* `depend()`: This method is called when the collection data is read, marking the place in the code as dependent on the collection data. Subsequent changes to the collection data will cause this place to be re-evaluated.
* `notify()`: This method is called when the collection data changes, notifying all dependent parts of the code that they need to re-evaluate.

You can also include more methods or other data in the dependency which you can access from the [`onDispose`](#ondispose-callback-void-dependency-dependency) method.

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

### `isInScope(dependency: Dependency): boolean` (optional)

The `isInScope` function is used for checking wether a SignalDB is in a reactive scope. If SignalDB is not in a reactive context, reactivity will be automatically disabled to avoid memory leaks. That mean that if you are not in a reactive scope ([`find`](/reference/core/collection/#find-selector-selector-t-options-options)/[`findOne`](/reference/core/collection/#findone-selector-selector-t-options-options) called outside an `effect` function), you have to turn off reactivity manually by adding the `{ reactivity: false }` option to the [`find`](/reference/core/collection/#find-selector-selector-t-options-options)/[`findOne`](/reference/core/collection/#findone-selector-selector-t-options-options) method<br>(e.g. `<collection>.find({ … }, { reactive: false })`).<br>
If you're not doing this, SignalDB setups reactivity unnecessarily and is not able to cleanup this automatically later on.

```js
isInScope() {
  return !!getScope()
}
```


### `onDispose(callback: () -> void, dependency: Dependency)` (optional)

This method is used to register a callback to be executed when the reactive computation is disposed. The dependency created in the [`create`](#create-dependency) method, will be passed as the second parameter. This can be useful if a framework requires data from the creation on disposal.
The `onDispose` function is optional, but it's highly recommended to implement it whenever it's possible. Without `onDispose`, SignalDB will not be able to clean up resources automatically when they are no longer needed. That means, that you have to call the [`cursor.cleanup()`](/queries/#cleanup) method manually at the end of the computation. Normally there is some way to cleanup things after the computation runs, but it's possible that you cannot implement it in this `onDispose` method (like in the [Angular adapter](/reactivity/angular/) for example).

```js
onDispose: (callback, dependency) => {
  onDispose(callback)
}
```

The above methods are what you need to implement to provide a basic reactivity system to your collection.

Here's a complete example of a reactivity adapter:

```js
import { signal, peek, getScope, onDispose } from '@maverick-js/signals'
import { createReactivityAdapter } from '@signaldb/core'

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
  isInScope: () => !!getScope(),
  onDispose: (callback) => {
    onDispose(callback)
  },
})

export default reactivity
```

Once the `reactivity` object is created, you can use it as the `reactivity` option when creating a new Collection. This will provide the collection with reactivity capabilities.
