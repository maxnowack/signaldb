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
