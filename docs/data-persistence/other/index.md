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

* `register` (`onChange: (data?: LoadResponse<T>) => Promise<void> | void`) => `Promise<void>`:
Called when initializing the collection.  The `onChange` function should be called when data in the adapter was updated externally so the collection can update its internal memory. You can optionally pass a `LoadResponse<T>` object (same as the return value of the `load` function) to make the implementation of your adapter more straightforward.
* `load` () => `Promise<{ items: T[] } | { changes: { added: T[], modified: T[], removed: T[] } }>`:
Load data from the adapter and return all its items (simple) or a changeset (more optimized). If it returns an object with an `items` property, the collection will replace all of its items with the ones from the adapter. Otherwise, this a partial load and the collection will apply only the `changes` to its internal memory.
* `save` ( `items: T[], changes: Changeset<T>` ) => `Promise<void>`:
Called by collection when data was updated.  Should save the data.
* `unregister?` ( `() => Promise<void>` ): *(optional)*
Called when the `dispose` method of the collection is called. Allows you to clean up things.

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
