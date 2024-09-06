---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/queries/
---
# Querying Data

Like most databases, SignalDB lets you query your data. It uses an approach similar to MongoDB, where you can apply selectors to filter your data and use options to control things like sorting, projection, skipping, and limiting the results.

When you run a query with `.find()`, the query doesn’t execute right away. Instead, it returns a cursor, which you can use to call methods and get the actual data—just like in MongoDB. This makes it easier to only process what you need. For example, if you just need the `.count()` of a query, you don’t have to load all the data.

A unique feature of SignalDB is that all queries are reactive by default. This means if you run a query and use a function on the returned cursor within the `effect` or `autorun` function of your reactivity library, the query will automatically rerun whenever the data changes.

## Queries

You can query you data by calling the [`.find()`](/collections/#find-selector-selector-t-options-options) or [`.findOne()`](/collections/#findone-selector-selector-t-options-options) method of your collection.
`.findOne()` returns the first found document while `.find()` returns a [cursor](#cursors).

### Selectors

SignalDB uses the [`mingo`](https://www.npmjs.com/package/mingo) library under the hood. It's very similar to MongoDB selectors. Check out their documentation to learn how a selector should look like: https://github.com/kofrasa/mingo

### Options

The second parameter you can pass to the `.find()` method are the options. With the options you can control things like sorting, projection, skipping or limiting data.

### Sorting

To sort the documention returned by a cursor, you can provide a `sort` object to the options. The object should contain the keys you want to sort and a direction (`1 = ascending`, `-1 = descending`)

```js
collection.find({}, {
  sort: { createdAt: -1 },
})
```

### Projection

You can also control which fields should be returned in the query. To do this, specify the `fields` object in the `options` of the `.find()` method.

```js
collection.find({}, {
  fields: { title: 1 },
})
```

### `skip` and `limit`

To skip or limit the result of a query, use the `skip` or `limit` options. Both options are optional.

```js
collection.find({}, {
  skip: 10,
  limit: 10,
})
```

## Cursors

Cursors are a concept that appears in many database systems and are used to iterate over and access data in a controlled manner. A cursor in SignalDB is a pointer to a specific set of rows.
It provides an interface to interact with items while offering capabilities like reactivity, transformation, observation of changes, and more.

You don't have to create a cursor by yourself. SignalDB is handling that for you and returns the cursor from a `.find()` call.

The following methods are available in the cursor class:

### ⚡️ `forEach(callback: (item: TransformedItem) => void)` *(reactive)*
Iterates over each item in the cursor, applying the given callback function.

> This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.

* Parameters:
  * `callback`: A function that gets executed for each item.

### ⚡️ `map<T> (callback: (item: TransformedItem) => T)` *(reactive)*
Maps each item in the cursor to a new array using the provided callback function.

> This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.

* Parameters:
  * `callback`: A function that transforms each item.
* Returns
  * An array of transformed items

### ⚡️ `fetch()` *(reactive)*
Fetches all the items in the cursor and returns them.

> This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.

* Returns
  * An array of items

### ⚡️ `count()` *(reactive)*
Counts the number of items in the cursor.

> This method is reactive, so it will rerun automatically when a document was added or removed from the query.

* Returns
  * The count of items

### `observeChanges(callbacks: ObserveCallbacks<U>, skipInitial = false)`
This method allows observation of changes in the cursor items. It uses callbacks to notify of different events like addition, removal, changes, etc.

* Parameters
  * `callbacks`: An object of Callback functions for different observation events.
    * `added(item: T)`gets called when a new item was added to the cursor
    * `addedBefore(item: T, before: T)`gets called when a new item was added to the cursor and also indicates the position of the new item
    * `changed(item: T)`gets called when an item in the cursor was changed
    * `movedBefore(item: T, before: T)`gets called when an item moved its position in the cursor
    * `removed(item: T)`gets called when an item was removed from the cursor
  * `skipInitial`: A boolean to decide whether to skip the initial observation event.
* Returns
  * A function that, when called, stops observing the changes.

### `requery()`
Re-queries the cursor to fetch items and check observers for any changes.

### `cleanup()`
The cleanup method is used to invoke all the cleanup callbacks. This helps in managing resources and ensuring efficient garbage collection. You have to call this method, if you're using a reactivity adapter, that doesn't support automatic cleanup.
