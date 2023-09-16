---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-manipulation/
---
# Data manipulation

## Inserting data

To insert data into a collection, use the [`.insert()`](/collections/#insert-item-omit-t-id-partial-pick-t-id) method.

```js
const id = collection.insert({ title: 'Hello World' })
```

## Updating data

To update data in a collection, use the [`.updateOne()`](/collections/#updateone-selector-selector-t-modifier-modifier-t) or [`.updateMany()`](/collections/#updatemanyselector-selector-t-modifier-modifier-t) method. SignalDB uses the [`mingo`](https://www.npmjs.com/package/mingo) library under the hood. It allows modifiers that are very similar to [MongoDB modifiers](https://www.mongodb.com/docs/manual/reference/operator/update/). Check out their documentation to learn how a modifier should look like: https://github.com/kofrasa/mingo#updating-documents

```js
collection.updateOne({ id: 'xyz' }, {
  $set: { title: 'Hello SignalDB' },
})
collection.updateMany({ title: 'Hello World' }, {
  $set: { title: 'Hello SignalDB' },
})
```

## Deleting data

To delete data from a collection, use the [`.removeOne()`](/collections/#removemanyselector-selector-t) or [`.removeMany()`](/collections/#removemanyselector-selector-t) method.

```js
collection.removeOne({ id: 'xyz' })
collection.removeMany({ title: 'Hello World' })
```
