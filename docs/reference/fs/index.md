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
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createFileSystemAdapter from '@signaldb/fs'

const dataAdapter = new DefaultDataAdapter({
  storage: name => createFileSystemAdapter(`./data/${name}`),
})

const Posts = new Collection('posts', dataAdapter)
```

Function to create a file system adapter for use with a collection.
In a Node.js environment, we don't have access to local storage for data preservation. Instead, we resort to saving our data as plain JSON files, which effectively serves as a way to persist collection items.

A data adapter asks its `storage` function for one adapter per collection and
passes the collection's name, which is why the function above derives the
folder from that name.

### Parameters

- `folderName` - The folder this collection lives in. The adapter creates it if it does not exist.
- `options` - (Optional) Configuration object with the following properties:
  - `serialize` - (Optional) Turns a stored value into a string. Default is `JSON.stringify`.
  - `deserialize` - (Optional) Reads that string back. Default is `JSON.parse`.

### Layout on disk

The adapter is given a **folder**, not a file. Inside it, `items/` holds one
file per document — sharded over two levels of subdirectory by the document's
id — and `index/` holds one file per indexed value. Writing one document
touches one file, so the cost of a write does not grow with the size of the
collection.
