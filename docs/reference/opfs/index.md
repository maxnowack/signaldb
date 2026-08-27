---
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
    content: '@signaldb/opfs | SignalDB'
- - meta
  - name: og:description
    content: Learn about the OPFS Adapter for SignalDB, a simple and straightforward way to store data in a browser's filesystem using the Origin Private File System API.
- - meta
  - name: description
    content: Learn about the OPFS Adapter for SignalDB, a simple and straightforward way to store data in a browser's filesystem using the Origin Private File System API.
- - meta
  - name: keywords
    content: OPFS Adapter, SignalDB, Origin Private File System API, data persistence, browser storage, Filesystem Adapter, JavaScript, TypeScript
---
# @signaldb/opfs

## createOPFSAdapter (`default`)

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createOPFSAdapter from '@signaldb/opfs'

const dataAdapter = new DefaultDataAdapter({
  storage: name => createOPFSAdapter(name),
})

const Posts = new Collection('posts', dataAdapter)
```

Function to create a OPFS adapter for use with a collection.
The OPFS Adapter is another way to store data in a browser environment.
This adapter is based on the [Origin Private File System API](https://developer.mozilla.org/en-US/docs/Web/API/File_System_API/Origin_private_file_system). It is a simple and straightforward way to store data in the browser's filesystem.

A data adapter asks its `storage` function for one adapter per collection and
passes the collection's name, which is why the function above uses that name as
the folder.

### Parameters

- `folderName` - The folder this collection lives in, relative to the origin private file system root.
- `options` - (Optional) Configuration object with the following properties:
  - `serialize` - (Optional) Turns a stored value into a string. Default is `JSON.stringify`.
  - `deserialize` - (Optional) Reads that string back. Default is `JSON.parse`.

Like the [Filesystem Adapter](/reference/fs/), the adapter is given a **folder**
rather than a file: `items/` holds one file per document, `index/` one file per
indexed value.

The OPFS Adapter is an alternative to the [Filesystem Adapter](https://signaldb.js.org/reference/fs/). The OPFS Adapter can only be used in a browser environment, while the Filesystem Adapter can only be used in a Node.js environment.

*Credits to [jamesgibson14](https://github.com/jamesgibson14)*
