---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/createindex/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/createindex/
- - meta
  - name: og:title
    content: createIndex | SignalDB
- - meta
  - name: og:description
    content: Learn how to use the createIndex function in SignalDB to add single-field indices to collections for faster query performance.
- - meta
  - name: description
    content: Learn how to use the createIndex function in SignalDB to add single-field indices to collections for faster query performance.
- - meta
  - name: keywords
    content: SignalDB, createIndex, collection indices, single-field index, performance optimization, data management, TypeScript, JavaScript, indexing, query optimization
---
# createIndex

```ts
import { createIndex } from '@signaldb/core'
```

The `createIndex()` function can be used to create a single field index on a collection. It takes a field name as a parameter and returns an IndexProvider object which can be passed directly to the `indices` option of the Collection constructor.

```js

import { createIndex, Collection } from '@signaldb/core'

interface User {
  id: string
  name: string
  age: number
}

const users = new Collection<User>({
  indices: [
    createIndex('name'),
    createIndex('age'),
  ],
})
```
