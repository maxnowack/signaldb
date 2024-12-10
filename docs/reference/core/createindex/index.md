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
