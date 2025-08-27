---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/createstorageadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/createstorageadapter/
- - meta
  - name: og:title
    content: createStorageAdapter | SignalDB
- - meta
  - name: og:description
    content: Learn how to implement custom storage adapters for SignalDB to meet specific requirements on a practical example using the File System.
- - meta
  - name: description
    content: Learn how to implement custom storage adapters for SignalDB to meet specific requirements on a practical example using the File System.
- - meta
  - name: keywords
    content: SignalDB, custom storage adapters, createStorageAdapter, data storage, File System adapter, JavaScript, TypeScript, data storage, adapter implementation, SignalDB extensions
---
# createStorageAdapter

```ts
import { createStorageAdapter } from '@signaldb/core'
```

While SignalDB comes with a few built-in Storage Adapters, there may be scenarios where you need to create a custom one to cater to specific requirements.

You can create a custom persistene adapter by calling `createStorageAdapter` and supplying a `StorageAdapter` compatible object as follows:

```ts
interface Changeset<T> {
  added:    T[],
  modified: T[],
  removed:  T[],
}

// contains either items or changes (but not both)
type LoadResponse<T> =
    { items:  T[],   changes?: never }
  | { items?: never, changes:  Changeset<T> }

interface StorageAdapter<T> {
  register(onChange: (data?: LoadResponse<T>) => void | Promise<void>): Promise<void>,
  load(): Promise<LoadResponse<T>>,
  save(items: T[], changes: Changeset<T>): Promise<void>,
  unregister?(): Promise<void>,
}
```

* **register** is called when initializing the collection.  The `onChange` function should be called when data in the adapter was updated externally so the collection can update its internal memory. You can optionally directly pass a `LoadResponse<T>` object returned from the `load` function to make the implementation of your adapter more straightforward.
* **load** is called to load data from the adapter and should return a `LoadResponse<T>` which includes either an `items` property containing all of the items, or a `changeset` property containing only the changes.  The collection will update its internal memory by either replacing all of its items, or applying the changeset to make differential changes, respectively.
* **save** is called when data was updated, and should save the data.  Both `items` and `changes` are provided so you can chose which one you'd like to use.
* **unregister?** *(optional)* is called when the `dispose` method of the collection is called. Allows you to clean up things.

Here is a short example how the File system storage adapter is implemented:

```js
import fs from 'fs'
import { createStorageAdapter } from '@signaldb/core'

export default function createFilesystemAdapter(filename: string) {
  return createStorageAdapter({
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
