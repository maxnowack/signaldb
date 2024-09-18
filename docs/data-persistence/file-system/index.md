---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/file-system/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-persistence/file-system/
- - meta
  - name: og:title
    content: Filesystem Adapter - SignalDB
- - meta
  - name: og:description
    content: Learn how to use the Filesystem Adapter in SignalDB for data persistence in a Node.js environment. Save your data as JSON files and easily manage collection items with our example code.
- - meta
  - name: description
    content: Learn​⬤
---
# Filesystem Adapter

In a Node.js environment, we don't have access to local storage for data preservation. Instead, we resort to saving our data as plain JSON files, which effectively serves as a way to persist collection items. All that's required from you is to specify the desired filename for each file.

```js
import { createFilesystemAdapter, Collection } from 'signaldb'

const posts = new Collection({
  persistence: createFilesystemAdapter('./posts.json'),
})
```
