---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/local-storage/
---
# localStorage Adapter

The localStorage Adapter is the most straightforward tool for usage within a browser setting. To initiate its use, the only step required is designating a specific name to identify your data. This named data forms a collection that will be stored in the localStorage, from which it can be loaded or saved as needed.

```js
import { createLocalStorageAdapter, Collection } from 'signaldb'

const posts = new Collection({
  persistence: createLocalStorageAdapter('posts'),
})
```
