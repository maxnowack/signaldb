---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/queries.html
---
# Queries

You can query you data by calling the [`.find()`](/collections#find-selector-selector-t-options-options) method of your collection.

## Selectors

SignalDB uses the [`mingo`](https://www.npmjs.com/package/mingo) library under the hood. It's very similar to MongoDB selectors. Check out their documentation to learn how a selector should look like: https://github.com/kofrasa/mingo

## Options

The second parameter you can pass to the `.find()` method are the options. With the options you can control things like sorting, projection, skipping or limiting data.

## Sorting

To sort the documention returned by a cursor, you can provide a `sort` object to the options. The object should contain the keys you want to sort and a direction (`1 = ascending`, `-1 = descending`)

```js
collection.find({}, {
  sort: { createdAt: -1 },
})
```

## Projection

You can also control which fields should be returned in the query. To do this, specify the `fields` object in the `options` of the `.find()` method.

```js
collection.find({}, {
  fields: { title: 1 },
})
```

## `skip` and `limit`

To skip or limit the result of a query, use the `skip` or `limit` options. Both options are optional.

```js
collection.find({}, {
  skip: 10,
  limit: 10,
})
```

## Cursors

*coming soon*
