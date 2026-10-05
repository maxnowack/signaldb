---
title: 'OPFS Adapter: Store Data in the Origin Private File System'
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/opfs/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/opfs/
- - meta
  - name: og:title
    content: 'OPFS Adapter: Store Data in the Origin Private File System | SignalDB'
- - meta
  - name: og:description
    content: What OPFS (Origin Private File System) is, how it compares to localStorage and IndexedDB, and how to persist SignalDB collections in OPFS with @signaldb/opfs.
- - meta
  - name: description
    content: What OPFS (Origin Private File System) is, how it compares to localStorage and IndexedDB, and how to persist SignalDB collections in OPFS with @signaldb/opfs.
- - meta
  - name: keywords
    content: OPFS Adapter, SignalDB, Origin Private File System API, data persistence, browser storage, Filesystem Adapter, JavaScript, TypeScript
---
# @signaldb/opfs

**What is OPFS?** The [Origin Private File System](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system) (OPFS) is a private file system that browsers provide to each website (origin). Pages can create, read and write files in it without any permission prompt, and the files are invisible to the user and to other sites. OPFS is part of the File System API and is supported in all current major browsers (Chrome, Edge, Firefox and Safari).

Compared to other browser storage:

| | localStorage | IndexedDB | OPFS |
|---|---|---|---|
| Data model | string key/value | object store with indexes | files and directories |
| API | synchronous | asynchronous (event-based) | asynchronous; fast synchronous access in Web Workers |
| Capacity | a few MB per origin | large (quota-based) | large (quota-based) |
| Typical use | small settings | structured app data | large files, databases, binary data |

`@signaldb/opfs` stores the documents of a SignalDB collection as a file in OPFS. This gives you persistent local storage for your data with a single line of configuration, which is useful for [offline-first](/offline-first/) apps.

## createOPFSAdapter (`default`)

```js
import createOPFSAdapter from '@signaldb/opfs'
import { Collection } from '@signaldb/core'

const collection = new Collection({
  persistence: createOPFSAdapter('path/to/db.json'),
})
```

Function to create a OPFS adapter for use with a collection.
The OPFS Adapter is another way to store data in a browser environment.
This adapter is based on the [Origin Private File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system). It is a simple and straightforward way to store data in the browser's filesystem. The only thing required is to specify the desired filename for each file.

The OPFS Adapter is an alternative to the [Filesystem Adapter](https://signaldb.js.org/reference/fs/). The OPFS Adapter can only be used in a browser environment, while the Filesystem Adapter can only be used in a Node.js environment.

*Credits to [jamesgibson14](https://github.com/jamesgibson14)*
