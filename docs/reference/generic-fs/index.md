---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/generic-fs/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/generic-fs/
- - meta
  - name: og:title
    content: "@signaldb/generic-fs | SignalDB"
- - meta
  - name: og:description
    content: Build a SignalDB storage adapter for any file-like backend by implementing a small driver — the shared foundation behind the filesystem and OPFS adapters.
- - meta
  - name: description
    content: Build a SignalDB storage adapter for any file-like backend by implementing a small driver — the shared foundation behind the filesystem and OPFS adapters.
- - meta
  - name: keywords
    content: SignalDB, generic-fs, createGenericFSAdapter, Driver, storage adapter, filesystem, OPFS, custom backend, JavaScript, TypeScript
---
# @signaldb/generic-fs

```ts
import createGenericFSAdapter from '@signaldb/generic-fs'
import type { Driver } from '@signaldb/generic-fs'
```

The shared foundation behind [`@signaldb/fs`](/reference/fs/) and
[`@signaldb/opfs`](/reference/opfs/). It turns a handful of low-level file
operations into a full [storage adapter](/reference/core/createstorageadapter/),
so a new file-like backend costs you a driver rather than an adapter.

Reach for it when you want to store a collection on something that can create
directories, read and write files, and list them — a remote file API, an
archive, a virtual filesystem — and you would rather not reimplement sharding
and index maintenance.

## createGenericFSAdapter (`default`)

```ts
createGenericFSAdapter<T, I>(driver: Driver<T, I>, folderName: string)
```

* `driver`: The low-level operations for your backend, see below.
* `folderName`: The folder this collection lives in.

Returns a `StorageAdapter`, ready to be handed to a
[data adapter](/data-adapters/):

```ts
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createGenericFSAdapter from '@signaldb/generic-fs'

const dataAdapter = new DefaultDataAdapter({
  storage: name => createGenericFSAdapter(myDriver, `./data/${name}`),
})

const Posts = new Collection('posts', dataAdapter)
```

## Layout

Inside `folderName` the adapter keeps two directories:

* `items/` — one file per document, sharded over two levels of subdirectory by the document's id, so a directory never grows without bound.
* `index/` — one file per indexed value.

A write therefore costs one file, not a rewrite of the whole collection.

## `Driver`

```ts
interface Driver<T extends { id: I }, I> {
  fileNameForId(id: I): Promise<string>
  fileNameForIndexKey(key: string): Promise<string>
  joinPath(...parts: string[]): Promise<string>
  ensureDir(path: string): Promise<void>
  fileExists(path: string): Promise<boolean>
  readObject(path: string): Promise<T[] | null>
  writeObject(path: string, value: T[]): Promise<void>
  readIndexObject(path: string): Promise<Record<string, I[]>[] | null>
  writeIndexObject(path: string, value: Record<string, I[]>[]): Promise<void>
  listFilesRecursive(directoryPath: string): Promise<string[]>
  removeEntry(path: string, options?: { recursive?: boolean }): Promise<void>
}
```

* **fileNameForId** turns a document id into a path *relative to* `items/`. This is where sharding happens: `@signaldb/fs` returns `ab/cd/abcdef…` so that a large collection does not put every file in one directory. Whatever you return has to be a legal name for your backend — escape it.
* **fileNameForIndexKey** does the same for an index key. Index keys are `serializeValue(value)` and can contain anything a document field can, so this one always needs escaping.
* **joinPath** joins path segments the way your backend spells paths.
* **ensureDir** creates a directory and its parents, and does nothing if it already exists.
* **fileExists** reports whether a path exists. Return `false` rather than throwing when it does not.
* **readObject** / **writeObject** read and write one document file. `readObject` returns `null` when the file is missing — that is not an error.
* **readIndexObject** / **writeIndexObject** do the same for an index file.
* **listFilesRecursive** returns every file under a directory, as paths relative to it.
* **removeEntry** deletes a file, or a directory with `{ recursive: true }`.

Serialization is yours: `readObject` and `writeObject` decide what a file
contains, which is how `@signaldb/fs` and `@signaldb/opfs` offer their
`serialize` and `deserialize` options.

## Example

[`@signaldb/fs`](/reference/fs/) is the shortest complete driver to read — it
implements the interface above against Node's `fs/promises` in about eighty
lines. [`@signaldb/opfs`](/reference/opfs/) is the same interface against the
browser's Origin Private File System.
