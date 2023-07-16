# Creating Custom Persistence Adapters

While SignalDB comes with a few built-in Persistence Adapters, there may be scenarios where you need to create a custom one to cater to specific requirements.

You can create a custom persistene adapter by calling the `createPersistenceAdapter` function. The function takes the adapter definition as the only argument. The definition is an object with the following keys:

* `register` (`required`, `(onChange: () => void) => Promise<void>`): This function should register the adapter. It will be called when initializing the collection and gets an `onChange` callback as the first parameter. This callback should be called, when the data in the adapter was updated externally, so that the collection could update it's internal memory.
* `load` (`required`, `() => Promise<{ items: T[], changes?: Changeset<T> }>`): This function loads the data from the adapter and should return all it's items and also a changeset, for optimizing performance.
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
