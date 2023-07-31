---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-manipulation.html
---
# Data manipulation

## Inserting data

To insert data into a collection, use the [`.insert()`](/collections#insert-item-omit-t-id-partial-pick-t-id) method.

```js
const id = collection.insert({ title: 'Hello World' })
```

## Updating data

To update data in a collection, use the [`.updateMany()`](/collections#updatemanyselector-selector-t-modifier-modifiert) method. SignalDB uses the [`mingo`](https://www.npmjs.com/package/mingo) library under the hood. It allows modifiers that are very similar to [MongoDB modifiers](https://www.mongodb.com/docs/manual/reference/operator/update/). Check out their documentation to learn how a modifier should look like: https://github.com/kofrasa/mingo#updating-documents

```js
collection.updateMany({ title: 'Hello World' }, {
  $set: { title: 'Hello SignalDB' },
})
```

## Deleting data

To delete data from a collection, use the [`.deleteMany()`](/collections#deletemanyselector-selector-t) method.

```js
collection.deleteMany({ title: 'Hello World' })
```
