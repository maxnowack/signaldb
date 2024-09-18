---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/queries/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/queries/
- - meta
  - name: og:title
    content: Querying Data | SignalDB
- - meta
  - name: og:description
    content: Discover how to query data in SignalDB with MongoDB-like selectors & more. Learn about reactive queries, cursors, and the new field-level reactivity feature.
- - meta
  - name: description
    content: Discover how to query data in SignalDB with MongoDB-like selectors & more. Learn about reactive queries, cursors, and the new field-level reactivity feature.
- - meta
  - name: keywords
    content: SignalDB, querying data, MongoDB-like, reactive queries, cursors, selectors, sorting, projection, field-level reactivity, JavaScript database, performance optimization
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

> With the `fields` option you can also control when you query will rerun. If you only query for a field that is not changing, the query will not rerun.
>
> Also see [⚡ Field-Level Reactitivity](#⚡%EF%B8%8F-field-level-reactivity-beta)

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

## ⚡️ Field-Level Reactivity (beta)

SignalDB introduces a powerful enhancement to its reactivity system called **Field-Level Reactivity**, which ensures that reactive functions (such as `effect` or `autorun`) only rerun when specific fields accessed in your code are changed. Previously, the reactive system would rerun the query if any field in any item of the result set was modified, regardless of whether those fields were actually used in the code. This led to unnecessary reactivity and potential performance bottlenecks, especially with large datasets.

### Key Features

* **Field-Level Reactivity**: Reactive reruns now occur only when the fields actually accessed by your code are modified, rather than triggering for all changes in the dataset.
* **Item-Level Reactivity**: If a query returns multiple items but you only access fields from specific items, changes in unaccessed items will not trigger a rerun.
* **Automatic Field Tracking**: Instead of manually specifying which fields to track using the `fields` option, SignalDB now automatically tracks fields as you access them. This reduces the chance of developer oversight and simplifies code maintenance.

### Opt-In to Field-Level Tracking

To leverage this feature, you must explicitly enable field-level reactivity by passing the `fieldTracking: true` option in the `.find()` method. When this option is enabled, the system will only track and respond to changes in the fields you access:

```js
effect(() => {
  const items = someCollection.find({}, { fieldTracking: true }).fetch()
  // Access the fields you care about here
  console.log(items[0].name) // Will rerun only if 'name' field of the 0th item changes
})
```

This behavior optimizes your app’s performance by reducing the number of unnecessary reruns. Instead of rerunning every time any field in any document changes, it only reruns when the relevant fields you’re interacting with are modified.

### Benefits of Automatic Field Tracking

1. Improved Performance: By reducing the scope of reactive reruns to only relevant data, SignalDB minimizes computational overhead and maximizes efficiency, particularly in scenarios where queries return large datasets or where irrelevant fields change frequently.
2. Simplified Code: Developers no longer need to manually specify fields to track. With automatic field tracking, the system handles this for you, allowing you to focus on business logic rather than managing reactivity manually.
3. Reduced Developer Error: Manually tracking fields can be error-prone, especially as queries evolve. Automatic field-level reactivity ensures that your queries remain optimal even as your code changes, making it easier to maintain over time.

Transition and Future Plans

This feature is currently in beta and must be explicitly enabled using `{ fieldTracking: true }` in the query options. Feel free to [open an issue](https://github.com/maxnowack/signaldb/issues/new) if you encounter any bugs. In future versions (such as v1.0.0), SignalDB plans to make field-level reactivity the default behavior. This will remove the need to explicitly enable the option, making the system more intuitive and efficient out-of-the-box.
