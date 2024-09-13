---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/collections/
---
# Collections

The Collection class is designed to manage and manipulate collections of data in memory, with options for reactivity, transformations and persistence adapters. Collections are schemaless, meaning that you don't need to define a schema for your data before you start using it. This allows you to store any data you want without worrying about defining a schema first. However, it's recommended that you define a typescript interface for the documents in the collection, so that you can benefit from type safety when working with the data.

## Importing

```js
import { Collection } from 'signaldb'
```

## Constructor

```js
const collection = new Collection<T, I, U>(options?: CollectionOptions<T, I, U>)
```

Constructs a new Collection object.

Parameters
* options (Optional): An object specifying various options for the collection. Options include:
  * memory: A [MemoryAdapter](/core-concepts/#memory-adapters) for storing items in memory.
  * reactivity: A [ReactivityAdapter](/reactivity/other/#custom-reactivity-adapters) for enabling reactivity.
  * persistence: A [PersistenceAdapter](/data-persistence/other/#creating-custom-persistence-adapters) for enabling persistent storage.
  * transform: A transformation function to be applied to items. The document that should be transformed is passed as the only parameter. The function should return the transformed document (e.g. `(doc: T) => U`)
  * indices: An array of [IndexProvider](/collections/#indexprovider) objects for creating indices on the collection.

## Methods

### `find(selector?: Selector<T>, options?: Options)`

Returns a new cursor object for the items in the collection that match a given selector and options.
Also check out the [queries section](/queries/).

Parameters
* `selector` (Optional): A function to filter items in the collection.
* `options` (Optional): Options for the cursor.

### `findOne(selector?: Selector<T>, options?: Options)`
Behaves the same like `.find()` but doesn't return a cursor. Instead it will directly return the first found document.

### `insert(item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>)`
Inserts an item into the collection and returns the ID of the newly inserted item.
Also check out the [data manipulation section](/data-manipulation/).

### `insertMany(items: Array<Omit<T, 'id'> & Partial<Pick<T, 'id'>>>)`
Inserts multiple items into the collection and returns the IDs of the newly inserted items.

Parameters
* `item`: The item to be inserted into the collection.

### `updateMany(selector: Selector<T>, modifier: Modifier<T>)`

Updates multiple items in the collection that match a given selector with the specified modifier.
Also check out the [data manipulation section](/data-manipulation/).

Parameters
* `selector`: A function to filter items in the collection.
* `modifier`: An object describing how to modify the matching items.


### `updateOne(selector: Selector<T>, modifier: Modifier<T>)`

Behaves the same like `.updateMany()` but only updates the first found document.

### `removeMany(selector: Selector<T>)`

Removes multiple items from the collection that match a given selector.

Parameters
* `selector`: A function to filter items in the collection.

### `removeOne(selector: Selector<T>)`

Behaves the same like `.removeMany()` but only removes the first found document.

### `batch(callback: () => void)`

If you need to execute many operations at once, things can get slow as the index would be rebuild on every change to the collection. To prevent this, you can use the `.batch()` method. This method will execute all operations inside the callback without rebuilding the index on every change. If you need to batch updates of multiple collections, you can use the global `Collection.batch()` method.

```js
collection.batch(() => {
  collection.insert({ name: 'Item 1' })
  collection.insert({ name: 'Item 2' })
  // …
})
```

## Events

The Collection class is equipped with a set of events that provide insights into the state and changes within the collection. These events, emitted by the class, can be crucial for implementing reactive behaviors and persistence management. Here is an overview of the events:

* `added`: Triggered when a new item is added to the collection. The event handler receives the added item as an argument.
* `changed`: Fired when an existing item in the collection undergoes modification. The event handler is passed the modified item.
* `removed`: Signaled when an item is removed or deleted from the collection. The event handler receives the removed item.

In addition to that, the collection will fire events for each executed method. For example, if you call `.updateOne()`, the collection will fire an `updateOne` event. The event handler will receive the selector and the modifier as arguments.

* `find`: Emitted when the `find` method is called. The event handler receives the selector, options and the cursor as arguments.
* `findOne`: Triggered when the `findOne` method is called. The event handler receives the selector, options and the returned item as arguments.
* `insert`: Fired when the `insert` method is called. The event handler receives the inserted item as an argument.
* `updateMany`: Emitted when the `updateMany` method is called. The event handler receives the selector and the modifier as arguments.
* `updateOne`: Triggered when the `updateOne` method is called. The event handler receives the selector and the modifier as arguments.
* `removeMany`: Emitted when the `removeMany` method is called. The event handler receives the selector as an argument.
* `removeOne`: Triggered when the `removeOne` method is called. The event handler receives the selector as an argument.

In addition to these basic events, there are events related to persistence operations. These events are only emitted when a persistence adapter is used.

* `persistence.init`: Marks the initialization of the persistence adapter.
* `persistence.error`: Indicates an error during persistence operations. The event handler receives an Error object describing the error.
* `persistence.transmitted`: Triggered after successfully transmitting data to the persistence adapter.
* `persistence.received`: Signifies the reception of data from the persistence adapter.

These events empower developers to build dynamic and responsive applications by reacting to changes in the collection, facilitating synchronization with external data sources, and handling persistence-related events.

## IndexProvider

An IndexProvider is an object that specifies how to create an index on a collection. It can be created with the `createIndexProvider()` function.
Take a look at the [`createIndex`](https://github.com/maxnowack/signaldb/blob/main/src/Collection/createIndex.ts) function for an example.

```js
import { createIndexProvider } from 'signaldb'

const indexProvider = createIndexProvider({
  query(selector: FlatSelector<T>) {
    // Receives a flat selector (without $and, $or or $nor) as the first parameter
    // Returns an object with the following properties:
    // {
    //   matched: true, // Wether the index were hit by the selector
    //   keys: [0, 1, 2, 3], // An array of all matched items array indices in the memory adapter (only provided if matched = true)
    //   fields: ['name', 'age'], // An array of all fields that were used in the index.
    //                            // These fields will be removed from the selector before
    //                            // it is executed on the memory adapter for optimization.
    // }
  },
  rebuild(items: T[]) {
    // Rebuild the index and save the array indices
  },
})
```

## createIndex

The `createIndex()` function can be used to create a single field index on a collection. It takes a field name as a parameter and returns an IndexProvider object which can be passed directly to the `indices` option of the Collection constructor.

```js

import { createIndex, Collection } from 'signaldb'

interface User {
  id: string
  name: string
  age: number
}

const users = new Collection<User>({
  indices: [
    createIndex('name'),
    createIndex('age'),
  ],
})
```
