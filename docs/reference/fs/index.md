---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/fs/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/fs/
- - meta
  - name: og:title
    content: '@signaldb/fs | SignalDB'
- - meta
  - name: og:description
    content: Learn how to use the Filesystem Adapter in SignalDB for data persistence in a Node.js environment.
- - meta
  - name: description
    content: Learn how to use the Filesystem Adapter in SignalDB for data persistence in a Node.js environment.
- - meta
  - name: kewords
    content: SignalDB, Filesystem Adapter, data persistence, Node.js, JSON files
---
# @signaldb/fs

## createFileSystemAdapter (`default`)

```js
import createFileSystemAdapter from '@signaldb/fs'
import { Collection } from '@signaldb/core'

const collection = new Collection({
  persistence: createFileSystemAdapter('path/to/db.json'),
})
```

Function to create a file system adapter for use with a collection.
In a Node.js environment, we don't have access to local storage for data preservation. Instead, we resort to saving our data as plain JSON files, which effectively serves as a way to persist collection items. All that's required from you is to specify the desired filename for each file.
