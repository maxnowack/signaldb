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

## IndexProvider

An IndexProvider is an object that specifies how to create an index on a collection. It can be created with the `createIndexProvider()` function.
Take a look at the [`createIdIndex`](https://github.com/maxnowack/signaldb/blob/main/src/Collection/createIdIndex.ts) function for an example.

```js
import { createIndexProvider } from 'signaldb'

const indexProvider = createIndexProvider({
  getItemPositions(selector: Selector<T>) {
    // Return an array of all matched items array indices in the memory adapter
    // or null if the index didn't hit on the selector
  },
  rebuild(items: T[]) {
    // Rebuild the index and save the array indices
  },
})
```
