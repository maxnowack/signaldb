---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/creatememoryadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/creatememoryadapter/
- - meta
  - name: og:title
    content: createMemoryAdapter | SignalDB
- - meta
  - name: og:description
    content: Learn how to use createMemoryAdapter in SignalDB to implement custom memory-based data storage for collections with array-like methods.
- - meta
  - name: description
    content: Learn how to use createMemoryAdapter in SignalDB to implement custom memory-based data storage for collections with array-like methods.
- - meta
  - name: keywords
    content: SignalDB, createMemoryAdapter, memory adapter, data storage, custom adapters, JavaScript, TypeScript, in-memory collections, collection management, array methods
---
# createMemoryAdapter

```js
import { createMemoryAdapter } from '@signaldb/core'

const memoryAdapter = createMemoryAdapter(/* ... */)
```

You can create a MemoryAdapter to use it with your collection by using the `createMemoryAdapter` helper function. You must pass the following methods with the same signature as in the `Array` class:
* `push(item: T): void`
* `pop(): T | undefined`
* `splice(start: number, deleteCount?: number, ...items: T[]): T[]`
* `map<U>(callbackfn: (value: T, index: number, array: T[]) => U): U[]`
* `find(predicate: (value: T, index: number, obj: T[]) => boolean): T | undefined`
* `filter(predicate: (value: T, index: number, array: T[]) => unknown): T[]`
* `findIndex(predicate: (value: T, index: number, obj: T[]) => boolean): number`
