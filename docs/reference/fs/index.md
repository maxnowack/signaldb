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
  - name: keywords
    content: SignalDB, Filesystem Adapter, data persistence, Node.js, JSON files
---
# @signaldb/fs

## createFilesystemAdapter (`default`)

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createFilesystemAdapter from '@signaldb/fs'

const dataAdapter = new DefaultDataAdapter({
  storage: name => createFilesystemAdapter(`./data/${name}`),
})

const Posts = new Collection('posts', dataAdapter)
```

Function to create a file system adapter for use with a collection.
In a Node.js environment there is no browser storage to persist data in, so this adapter stores each collection in a folder on disk (see [Layout on disk](#layout-on-disk) below). Every file is written with `serialize` (JSON by default).

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
