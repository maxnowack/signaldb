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

You can query you data by calling the [`.find()`](/reference/core/collection/#find-selector-selector-t-options-options) or [`.findOne()`](/reference/core/collection/#findone-selector-selector-t-options-options) method of your collection.
`.findOne()` returns the first found document while `.find()` returns a [cursor](/reference/core/cursor/).

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

::: tip
With the `fields` option you can also control when you query will rerun. If you only query for a field that is not changing, the query will not rerun.

Also see [Field-Level Reactitivity](#field-level-reactivity)
:::

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

## Field-Level Reactivity

SignalDB introduces a powerful enhancement to its reactivity system called **Field-Level Reactivity**, which ensures that reactive functions (such as `effect` or `autorun`) only rerun when specific fields accessed in your code are changed. Previously, the reactive system would rerun the query if any field in any item of the result set was modified, regardless of whether those fields were actually used in the code. This led to unnecessary reactivity and potential performance bottlenecks, especially with large datasets.

### Key Features

* **Field-Level Reactivity**: Reactive reruns now occur only when the fields actually accessed by your code are modified, rather than triggering for all changes in the dataset.
* **Item-Level Reactivity**: If a query returns multiple items but you only access fields from specific items, changes in unaccessed items will not trigger a rerun.
* **Automatic Field Tracking**: Instead of manually specifying which fields to track using the `fields` option, SignalDB now automatically tracks fields as you access them. This reduces the chance of developer oversight and simplifies code maintenance.

### Opt-In to Field-Level Tracking

To enable field-level reactivity, there are three ways to configure field tracking: globally, per collection, or through the options parameter of the `.find()` method.

#### 1. Global Configuration

To enable field tracking globally for all collections in your application, use the static method `Collection.setFieldTracking`. This ensures that field tracking is active by default across all collections unless overridden.

```js
Collection.setFieldTracking(true) // Enables field tracking globally
```

#### 2. Per Collection Configuration

To configure field tracking for a specific collection, use the setFieldTracking method on that collection.

```js
someCollection.setFieldTracking(true) // Enables field tracking for this collection only
```

#### 3. Enable Field Tracking in `.find()` Options

You can enable field tracking on a per-query basis by passing the fieldTracking: true option to the .find() method. When this option is set, reactivity is scoped to the fields you access.

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
