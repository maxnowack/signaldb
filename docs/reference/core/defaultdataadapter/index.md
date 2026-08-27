---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/defaultdataadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/defaultdataadapter/
- - meta
  - name: og:title
    content: DefaultDataAdapter | SignalDB
- - meta
  - name: og:description
    content: The default SignalDB data adapter — keeps collections in memory on the main thread, answers queries synchronously and persists writes in the background.
- - meta
  - name: description
    content: The default SignalDB data adapter — keeps collections in memory on the main thread, answers queries synchronously and persists writes in the background.
- - meta
  - name: keywords
    content: SignalDB, DefaultDataAdapter, data adapter, in-memory, storage adapter, synchronous queries, JavaScript, TypeScript
---
# DefaultDataAdapter

```ts
import { DefaultDataAdapter } from '@signaldb/core'
```

Keeps every collection in memory on the main thread and answers queries from
there. Writes are applied immediately and persisted in the background, which is
what makes an [optimistic UI](/optimistic-ui/) fall out for free.

This is the adapter to use unless you have a reason not to, and the one a
collection constructed without an adapter uses.

## Usage

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createLocalStorageAdapter from '@signaldb/localstorage'

const dataAdapter = new DefaultDataAdapter({
  storage: name => createLocalStorageAdapter(name),
})

const Posts = new Collection('posts', dataAdapter)
const Authors = new Collection('authors', dataAdapter)
```

Without a `storage` function the data lives only in memory and is gone on
reload — useful for tests and for data you derive rather than keep.

## Options

```ts
new DefaultDataAdapter(options?: {
  storage?: (name: string) => StorageAdapter<any, any> | undefined
  onError?: (name: string, error: Error) => void
})
```

* `storage`: Called once per collection with the collection's name, and returns the [storage adapter](/data-persistence/) that collection persists to. Return `undefined` to keep a particular collection in memory only.
* `onError`: Called when a background operation fails — a write that could not be persisted, for instance. Without it such an error has nowhere to go, so this is worth wiring up.

## Queries are synchronous

Because the data is in memory, `find().fetch()` returns the result directly and
`Cursor#isLoading()` is never `true` after the collection is ready. Waiting for
[`collection.ready()`](/reference/core/collection/#ready) is still necessary
before the first read: until the storage adapter has loaded, the collection is
empty, and an empty result is indistinguishable from a real one.

## Indices

The `indices` a collection declares are used here. A selector no index covers is
answered by scanning the collection in memory — fine while it is small, and the
thing to fix when it grows. See
[what this means for your collections](/data-persistence/#what-this-means-for-your-collections).
