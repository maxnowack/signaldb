---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-persistence/
- - meta
  - name: og:title
    content: Storage Adapters | SignalDB
- - meta
  - name: og:description
    content: Learn how Storage Adapters in SignalDB provide an abstraction layer over different storage systems like localStorage, IndexedDB, and remote servers.
- - meta
  - name: description
    content: Learn how Storage Adapters in SignalDB provide an abstraction layer over different storage systems like localStorage, IndexedDB, and remote servers.
- - meta
  - name: keywords
    content: data persistence, storage, adapters, SignalDB, localStorage, IndexedDB, remote server, data storage, data retrieval, storage abstraction
---
# Storage Adapters

Storage adapters in SignalDB provide the mechanism for storing and retrieving data, ensuring that your data is kept safe across sessions and reloads of your application.

These adapters interact with the underlying storage medium, such as localStorage, IndexedDB, or even a remote server, and handle the specifics of those storage systems while providing a consistent interface for data operations in your application.

Storage adapters are responsible for transforming the high-level operations you perform on your data (such as saving a document or loading a collection) into the low-level operations that the specific storage system can understand and perform.

The main benefit of using storage adapters is the abstraction they provide. They allow SignalDB to remain agnostic to the underlying storage system. This means that you can switch between different systems without changing the rest of your code.

The follwing storage adapters are currently available:

- [IndexedDB](/reference/indexeddb/)
- [localStorage](/reference/localstorage/)
- [OPFS](/reference/opfs/)
- [FileSystem](/reference/fs/)

Building your own storage adapter for your speicific use case is also possible and pretty straight forward.
See [`createStorageAdapter`](/reference/core/createstorageadapter/) for more information.

## Why a storage adapter never sees a selector

A storage adapter is asked for *all* items, for items *by id*, or for the
contents of *one index*. It is never handed a query. That is deliberate, and it
is the reason the interface is as small as it is:

```ts
readAll(): Promise<T[]>
readIds(ids: I[]): Promise<T[]>
readIndex(field: string): Promise<Map<any, Set<I>>>
```

Query semantics live in SignalDB, in one place. A storage backend only has to
be able to store things and find them again — it never has to understand
`$in`, `$gt`, `$regex`, or how they combine under `$and` and `$or`.

That keeps the set of possible backends wide open. Anything that can persist
bytes and look something up can be a storage adapter: a file system that maps
each index onto a directory, an archive file, a key-value store, a remote
endpoint that only offers a fetch-by-key. None of them are excluded for lacking
a query language, and none of them can quietly disagree with another about what
a selector means. One implementation of the semantics means one place to fix a
bug in them and one suite to test them.

The alternative — letting adapters answer queries when they can — sounds
attractive for backends that *do* have a query language, but it puts the
selector semantics into every adapter that opts in, makes an adapter's
capabilities unpredictable from the outside, and turns "which adapter am I
using" into something that changes results rather than just performance.

### What this means for your collections

The cost of this design is that **SignalDB can only narrow a query down to the
indices you declared.** A selector that no index covers is answered by reading
the whole collection out of storage and filtering it in JavaScript. That is
fine for small collections and for one-off reads, and it is the wrong thing for
a collection that grows.

So for anything that keeps growing, declare the fields you actually select on
as indices when you create the collection:

```ts
const posts = new Collection({ indices: ['authorId', 'status'] })
```

Selecting a single item by `id` needs no index. It is resolved directly through
the adapter's `readIds` — every storage can look an item up by its id, which is
why that is part of the interface rather than something you have to declare.
