---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/collection/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/collection/
- - meta
  - name: og:title
    content: Collection | SignalDB
- - meta
  - name: og:description
    content: Learn about the SignalDB Collection class, a flexible and reactive way to manage and manipulate schemaless data with support for data adapters, storage adapters and transformations.
- - meta
  - name: description
    content: Learn about the SignalDB Collection class, a flexible and reactive way to manage and manipulate schemaless data with support for data adapters, storage adapters and transformations.
- - meta
  - name: keywords
    content: SignalDB, Collection, data management, reactive collections, data adapters, storage adapters, TypeScript, JavaScript, schemaless data, field-level reactivity, batch operations
---
# Collection

```ts
import { Collection } from '@signaldb/core'
```

The Collection class is designed to manage and manipulate collections of data, with options for reactivity, transformations and a [data adapter](/data-persistence/) that decides where the data operations actually happen. Collections are schemaless, meaning that you don't need to define a schema for your data before you start using it. This allows you to store any data you want without worrying about defining a schema first. However, it's recommended that you define a typescript interface for the documents in the collection, so that you can benefit from type safety when working with the data.

## Static Methods

### `setFieldTracking(enable: boolean)`

Enables or disables field tracking for all collections. See [Field-Level Reactivity](/queries/#field-level-reactivity) for more information.

### `batch(collections?: Collection[], callback: () => void)`

If you need to execute many operations at once in multiple collections, you can use the global `Collection.batch()` method. This method will execute all operations inside the callback without rebuilding the index on every change. Pass the collections you are writing to — see the [instance method](#batch-callback-void) for why that matters.

### `getCollections()`

Returns an array of all collections that have been created.

### `onCreation(callback: (collection: Collection) => void)`

Registers a callback that will be called whenever a new collection is created. The callback will receive the newly created collection as an argument.

### `onDispose(callback: (collection: Collection) => void)`

Registers a callback that will be called whenever a collection is disposed. The callback will receive the disposed collection as an argument.

### `enableDebugMode()`

Enables debug mode for all collections. This will enable measurements for query timings and other debug information. It also switches on `reportLargeQueries()` at 500 rows.

### `reportLargeQueries(rows: number | null)`

Reports each live query holding more than `rows` rows once, together with the
stack that registered it. Pass `null` to switch it off again.

```js
Collection.reportLargeQueries(500)
```

A reactive query registered from a long-lived place — a module scope, a store,
a component that is never unmounted — keeps its cost for the lifetime of the
application, and there is otherwise nothing to see: the query works, and its
price only shows up much later as an application that has grown slow. This is
how you find it.

## Constructor

```js
const collection = new Collection<T, I, U>(name: string, dataAdapter: DataAdapter, options?: CollectionOptions<T, I, U>)
```

Constructs a new Collection object. The name identifies the collection — to its
data adapter, which uses it to find the collection's storage, and in the
developer tools.

Parameters
* `name`: The name of the collection.
* `dataAdapter`: The [DataAdapter](/reference/core/dataadapter/) that answers this collection's data operations. One data adapter usually serves every collection of an application.
* `options` (Optional): An object specifying various options for the collection. Options include:
  * reactivity: A [ReactivityAdapter](/reactivity/) for enabling reactivity.
  * transform: A transformation function to be applied to items. The document that should be transformed is passed as the only parameter. The function should return the transformed document (e.g. `(doc: T) => U`)
  * transformAll: A function that receives all items of a query result at once and returns the transformed list. Useful for resolving relations without an N+1 query — see [ORM](/orm/).
  * indices: An array of field names to index, e.g. `['authorId', 'status']`.
  * primaryKeyGenerator: A function that generates a unique ID for the item. If not provided, a default generator will be used.

A collection can also be constructed with options alone
(`new Collection(options?)`), in which case it uses a default data adapter and
keeps its data in memory only.

## Methods

### `ready()`

Resolves when the storage adapter finished initializing and the collection is ready to be used.
This is useful when you need to wait for the collection to be ready before executing any operations directly after creating it.

Example:
```ts
const collection = new Collection('items', dataAdapter)
await collection.ready()

await collection.insert({ name: 'Item 1' })
// ...
```

### `isReady()`

⚡️ this function is reactive!

Returns whether the collection is ready, as a reactive value. Use this where you
want to render something while the collection is still initializing; use
[`ready()`](#ready) where you want to wait for it.

```ts
const collection = new Collection('items', dataAdapter)

effect(() => {
  if (!collection.isReady()) return
  console.log(collection.find().fetch())
})
```

### `resetData()`

Clears the current in-memory data and reloads items from the configured storage adapter.
If there are pending local updates queued during initialization, `resetData()` waits until they are transmitted before reloading.

Example:
```ts
const collection = new Collection('items', dataAdapter)
await collection.ready()

await collection.resetData()
```

This method requires a data adapter with a configured storage adapter.

### `find(selector?: Selector<T>, options?: Options)`

Returns a new [cursor object](/reference/core/cursor/) for the items in the collection that match a given selector and options.
Also check out the [queries section](/queries/).

Parameters
* `selector` (Optional): A function to filter items in the collection.
* `options` (Optional): Options for the cursor — `sort`, `skip`, `limit`, `fields`, `reactive`, `fieldTracking`, and `async`.

Pass `async: true` to get a cursor whose methods resolve to their result
instead of returning it. That is what you want outside a reactive scope when
the data adapter cannot answer on the spot — see
[queries that are not answered immediately](/queries/#queries-that-are-not-answered-immediately).

```js
const posts = await collection.find({ status: 'published' }, { async: true }).fetch()
```

### `findOne(selector?: Selector<T>, options?: Options)`
Behaves the same like [`.find()`](#find-selector-selector-t-options-options) but doesn't return a cursor. Instead it will directly return the first found document. With `async: true` it returns a promise resolving to that document.

### Loading state

Three reactive methods report what the collection is currently doing. All of
them register a dependency in a reactive scope.

* `isLoading()`: ⚡️ reactive — whether the collection is currently pulling or pushing data. Initially `false`; it turns `true` once a pull actually starts.
* `isPulling()`: ⚡️ reactive — whether data is currently being loaded.
* `isPushing()`: ⚡️ reactive — whether data is currently being saved.

### `insert(item: Omit<T, 'id'> & Partial<Pick<T, 'id'>>)`
Inserts an item into the collection and returns a promise resolving to the ID of the newly inserted item.
Also check out the [data manipulation section](/data-manipulation/).

### `insertMany(items: Array<Omit<T, 'id'> & Partial<Pick<T, 'id'>>>)`
Inserts multiple items into the collection and returns a promise resolving to the IDs of the newly inserted items.

Parameters
* `item`: The item to be inserted into the collection.

### `updateMany(selector: Selector<T>, modifier: Modifier<T>, options?: { upsert?: boolean })`

Updates multiple items in the collection that match a given selector with the specified modifier and returns a promise resolving to the number of updated items.
Also check out the [data manipulation section](/data-manipulation/).

Parameters
* `selector`: A function to filter items in the collection.
* `modifier`: An object describing how to modify the matching items.
* `options`: An object with additional options. Currently only `upsert` is supported, which will insert a document based on the modifier, if the selector doesn't match any documents.


### `updateOne(selector: Selector<T>, modifier: Modifier<T>, options?: { upsert?: boolean })`

Behaves the same like `.updateMany()` but only updates the first found document.

### `replaceOne(selector: Selector<T>, replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>, options?: { upsert?: boolean })`

Replaces a single item in the collection that matches a given selector with the specified replacement and returns a promise resolving to `0` or `1`.
Also check out the [data manipulation section](/data-manipulation/).

Parameters
* `selector`: A function to filter items in the collection.
* `replacement`: The new item that should replace the existing one.
* `options`: An object with additional options. Currently only `upsert` is supported, which will insert a document based on the replacement, if the selector doesn't match any documents.

### `removeMany(selector: Selector<T>)`

Removes multiple items from the collection that match a given selector and returns a promise resolving to the number of removed items.

Parameters
* `selector`: A function to filter items in the collection.

### `removeOne(selector: Selector<T>)`

Behaves the same like `.removeMany()` but only removes the first found document.

### `batch(callback: () => void)`

If you need to execute many operations at once, things can get slow as the index would be rebuild on every change to the collection. To prevent this, you can use the `.batch()` method. This method will execute all operations inside the callback without rebuilding the index on every change.

```js
await collection.batch(async () => {
  await collection.insert({ name: 'Item 1' })
  await collection.insert({ name: 'Item 2' })
  // …
})
```

If the writes span several collections, pass them to the static
`Collection.batch()`:

```js
await Collection.batch([posts, authors], async () => {
  await posts.insert({ title: 'Foo', authorId: 'a1' })
  await authors.updateOne({ id: 'a1' }, { $inc: { postCount: 1 } })
})
```

::: warning
`Collection.batch()` **without** a list of collections batches *every*
collection in the process and defers every live query everywhere until the
batch ends. That is the right thing for a handful of writes belonging to one
event, and the wrong thing around anything whose length depends on the data.
Name the collections you are actually writing to.
:::

### `isBatchOperationInProgress()`

Returns whether an unscoped `Collection.batch()` — one covering every
collection — is currently running. A batch scoped to a list of collections does
not set this, so an unrelated collection never reports itself as batching.

### `dispose()`

Disposes the collection and all its resources. This will unregister the storage adapter and clean up all internal data structures.

### `setFieldTracking(enabled: boolean)`

Enables or disables field tracking for the collection. See [Field-Level Reactivity](/queries/#field-level-reactivity) for more information.

## Events

The Collection class is equipped with a set of events that provide insights into the state and changes within the collection. These events, emitted by the class, can be crucial for implementing reactive behaviors and persistence management. Here is an overview of the events:

* `added`: Triggered when a new item is added to the collection. The event handler receives the added item as an argument.
* `changed`: Fired when an existing item in the collection undergoes modification. The event handler is passed the modified item.
* `removed`: Signaled when an item is removed or deleted from the collection. The event handler receives the removed item.
* `validate`: Emitted when an item should be validated. The event handler receives the item as an argument. Validate the item inside of the event handler and throw an error if the item is invalid. This will prevent the item from being inserted or updated.

In addition to that, the collection will fire events for each executed method. For example, if you call `.updateOne()`, the collection will fire an `updateOne` event. The event handler will receive the selector and the modifier as arguments.

* `find`: Emitted when the `find` method is called. The event handler receives the selector, options and the cursor as arguments.
* `findOne`: Triggered when the `findOne` method is called. The event handler receives the selector, options and the returned item as arguments.
* `insert`: Fired when the `insert` method is called. The event handler receives the inserted item as an argument.
* `updateMany`: Emitted when the `updateMany` method is called. The event handler receives the selector and the modifier as arguments.
* `updateOne`: Triggered when the `updateOne` method is called. The event handler receives the selector and the modifier as arguments.
* `replaceOne`: Emitted when the `replaceOne` method is called. The event handler receives the selector and the replacement as arguments.
* `removeMany`: Emitted when the `removeMany` method is called. The event handler receives the selector as an argument.
* `removeOne`: Triggered when the `removeOne` method is called. The event handler receives the selector as an argument.

In addition to these, there are events about the queries a collection is serving:

* `query.error`: A query backing at least one live cursor failed and will not deliver results. The event handler receives the error, the selector and the options. This event matters more than it looks: a cursor whose query failed keeps returning its neutral empty result, which is indistinguishable from a query that legitimately matched nothing. Listening here is the only way to tell the two apart.
* `observer.created`: A live query was registered. The event handler receives the selector and options.
* `observer.disposed`: A live query was given up. The event handler receives the selector and options.
* `getItems`: Items were read for a selector. The event handler receives the selector.

::: warning Removed in v2
The `persistence.init`, `persistence.error`, `persistence.transmitted` and
`persistence.received` events no longer exist. Use the reactive
`isLoading()`, `isPulling()` and `isReady()` methods instead, and `query.error`
for failures. See the [upgrade guide](/upgrade/v2/).
:::

These events empower developers to build dynamic and responsive applications by reacting to changes in the collection and facilitating synchronization with external data sources.
