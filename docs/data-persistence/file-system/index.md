---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/file-system/
---
# Filesystem Adapter

In a Node.js environment, we don't have access to local storage for data preservation. Instead, we resort to saving our data as plain JSON files, which effectively serves as a way to persist collection items. All that's required from you is to specify the desired filename for each file.

```js
import { createFilesystemAdapter, Collection } from 'signaldb'

const posts = new Collection({
  persistence: createFilesystemAdapter('./posts.json'),
})
```
