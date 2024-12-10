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

## Inserting data

To insert data into a collection, use the [`.insert()`](/reference/core/collection/#insert-item-omit-t-id-partial-pick-t-id) method.

```js
const id = collection.insert({ title: 'Hello World' })
```

## Updating data

To update data in a collection, use the [`.updateOne()`](/reference/core/collection/#updateone-selector-selector-t-modifier-modifier-t) or [`.updateMany()`](/reference/core/collection/#updatemanyselector-selector-t-modifier-modifier-t) method. SignalDB uses the [`mingo`](https://www.npmjs.com/package/mingo) library under the hood. It allows modifiers that are very similar to [MongoDB modifiers](https://www.mongodb.com/docs/manual/reference/operator/update/). Check out their documentation to learn how a modifier should look like: https://github.com/kofrasa/mingo#updating-documents

```js
collection.updateOne({ id: 'xyz' }, {
  $set: { title: 'Hello SignalDB' },
})
collection.updateMany({ title: 'Hello World' }, {
  $set: { title: 'Hello SignalDB' },
})
```

## Deleting data

To delete data from a collection, use the [`.removeOne()`](/reference/core/collection/#removemanyselector-selector-t) or [`.removeMany()`](/reference/core/collection/#removemanyselector-selector-t) method.

```js
collection.removeOne({ id: 'xyz' })
collection.removeMany({ title: 'Hello World' })
```
