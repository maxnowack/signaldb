---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/indexeddb/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/indexeddb/
- - meta
  - name: og:title
    content: '@signaldb/indexeddb | SignalDB'
- - meta
  - name: og:description
    content: Learn how to use the IndexedDB Adapter in SignalDB for robust and efficient browser data storage.
- - meta
  - name: description
    content: Learn how to use the IndexedDB Adapter in SignalDB for robust and efficient browser data storage.
- - meta
  - name: keywords
    content: SignalDB, IndexedDB adapter, data persistence, browser storage, JavaScript, TypeScript, data management, IndexedDB, collection setup, SignalDB adapters
---
# @signaldb/indexeddb

## createIndexedDBAdapter (`default`)

```js
import createIndexedDBAdapter from '@signaldb/indexeddb'
import { Collection } from '@signaldb/core'

const collection = new Collection({
  persistence: createIndexedDBAdapter('posts'),
})
```

Function to create an IndexedDB adapter for use with a collection.
The IndexedDB Adapter is designed for robust and efficient data storage within a browser environment, especially for larger datasets or those requiring more advanced querying capabilities. To get started, provide a unique name for your collection. This name acts as the identifier for your data, enabling it to be stored and retrieved seamlessly using IndexedDB. The adapter supports advanced operations such as updates, deletions, and batch processing, ensuring data integrity and performance.

Example Usage:

```js
import createIndexedDBAdapter from '@signaldb/indexeddb'
import { Collection } from '@signaldb/core'

const collection = new Collection({
  persistence: createIndexedDBAdapter('myCollection'),
})

// Insert data
collection.insert({ id: '1', name: 'John Doe' })

// Fetch data
const items = collection.find().fetch()
console.log(items) // [{ id: '1', name: 'John Doe' }]
```
