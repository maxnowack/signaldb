---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-manipulation/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-manipulation/
- - meta
  - name: og:title
    content: Data Manipulation | SignalDB
- - meta
  - name: og:description
    content: Learn how to manipulate data in SignalDB. This guide covers methods such as `.insert()`, `.updateOne()`, `.updateMany()`, `.removeOne()`, and `.removeMany()`.
- - meta
  - name: description
    content: Learn how to manipulate data in SignalDB. This guide covers methods such as `.insert()`, `.updateOne()`, `.updateMany()`, `.removeOne()`, and `.removeMany()`.
- - meta
  - name: keywords
    content: signaldb, data manipulation, insert data, update data, delete data, JavaScript database, mingo, MongoDB modifiers, SignalDB methods, reactive database
---
# Data manipulation

Every write is asynchronous and returns a promise: `insert` resolves to the id
of the new item, `updateOne`, `replaceOne` and `removeOne` to `0` or `1`, and
`updateMany` and `removeMany` to the number of items they touched. Awaiting a write means
waiting for the data layer to confirm it — the change is visible to your
queries before that, which is what makes an optimistic UI possible.

## Inserting data

To insert data into a collection, use the [`.insert()`](/reference/core/collection/#insert-item-omit-t-id-partial-pick-t-id) method.

```js
const id = await collection.insert({ title: 'Hello World' })
```

## Updating data

To update data in a collection, use the [`.updateOne()`](/reference/core/collection/#updateone-selector-selector-t-modifier-modifier-t) or [`.updateMany()`](/reference/core/collection/#updatemanyselector-selector-t-modifier-modifier-t) method. SignalDB uses the [`mingo`](https://www.npmjs.com/package/mingo) library under the hood. It allows modifiers that are very similar to [MongoDB modifiers](https://www.mongodb.com/docs/manual/reference/operator/update/). Check out their documentation to learn how a modifier should look like: https://github.com/kofrasa/mingo#updating-documents

```js
const updated = await collection.updateOne({ id: 'xyz' }, {
  $set: { title: 'Hello SignalDB' },
})
const updatedCount = await collection.updateMany({ title: 'Hello World' }, {
  $set: { title: 'Hello SignalDB' },
})
```

## Replacing items

To replace an item in a collection, use the [`.replaceOne()`](/reference/core/collection/#replaceone-selector-selector-t-replacement-omit-t-id-partial-pick-t-id-options-upsert-boolean) method.

```js
await collection.replaceOne({ id: 'xyz' }, { title: 'Hello SignalDB' })
```

## Deleting data

To delete data from a collection, use the [`.removeOne()`](/reference/core/collection/#removemanyselector-selector-t) or [`.removeMany()`](/reference/core/collection/#removemanyselector-selector-t) method.

```js
await collection.removeOne({ id: 'xyz' })
await collection.removeMany({ title: 'Hello World' })
```
