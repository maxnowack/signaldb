---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/other/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-persistence/other/
- - meta
  - name: og:title
    content: Creating Custom Persistence Adapters | SignalDB
- - meta
  - name: og:description
    content: Learn how to implement custom persistence adapters for SignalDB to meet specific requirements on a practical example using the File System.
- - meta
  - name: description
    content: Learn how to implement custom persistence adapters for SignalDB to meet specific requirements on a practical example using the File System.
- - meta
  - name: keywords
    content: SignalDB, custom persistence adapters, createPersistenceAdapter, data persistence, File System adapter, JavaScript, TypeScript, data storage, adapter implementation, SignalDB extensions
---
# Creating Custom Persistence Adapters

While SignalDB comes with a few built-in Persistence Adapters, there may be scenarios where you need to create a custom one to cater to specific requirements.

You can create a custom persistene adapter by calling the `createPersistenceAdapter` function. The function takes the adapter definition as the only argument. The definition is an object with the following keys:

* `register` (`required`, `(onChange: (data?: LoadResponse<T>) => void) => Promise<void>`): This function should register the adapter. It will be called when initializing the collection and gets an `onChange` callback as the first parameter. This callback should be called, when the data in the adapter was updated externally, so that the collection could update it's internal memory. You can also pass a `LoadResponse<T>` object to the callback (same as the return value of the `load` function), to make the implementation of your adapter more straightforward.
* `load` (`required`, `() => Promise<{ items: T[] } | { changes: { added: T[], modified: T[], removed: T[] } }>`): This function loads the data from the adapter and should return all it's items or a changeset, for optimizing performance. If the load function returns an object with an `items` property, the collection will do a full load and replace all it's items with the ones from the adapter. If the `items` property is omitted in the return value of the load function, the collection will do a partial load and apply the `changes` to it's internal memory.
* `save` (`required`, `(items: T[], changes: Changeset<T>) => Promise<void>`): This function will be called from the collection, when data was updated. This function should save this data to the adapter.

To make things more clear, here is a short example how the File system persistence adapter is implemented.

```js
import fs from 'fs'
import { createPersistenceAdapter } from 'signaldb'

export default function createFilesystemAdapter(filename: string) {
  return createPersistenceAdapter({
    async register(onChange) {
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) await fs.promises.writeFile(filename, '[]')
      fs.watch(filename, { encoding: 'utf8' }, () => {
        void onChange()
      })
    },
    async load() {
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) return { items: [] }
      const contents = await fs.promises.readFile(filename, 'utf8')
      const items = JSON.parse(contents)
      return { items }
    },
    async save(items) {
      await fs.promises.writeFile(filename, JSON.stringify(items))
    },
  })
}
```
