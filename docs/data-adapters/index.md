---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-adapters/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-adapters/
- - meta
  - name: og:title
    content: Data Adapters | SignalDB
- - meta
  - name: og:description
    content: Learn how data adapters decide where a SignalDB collection's data operations happen — on the main thread, asynchronously against storage, or in a web worker.
- - meta
  - name: description
    content: Learn how data adapters decide where a SignalDB collection's data operations happen — on the main thread, asynchronously against storage, or in a web worker.
- - meta
  - name: keywords
    content: SignalDB, data adapter, DataAdapter, DefaultDataAdapter, AsyncDataAdapter, WorkerDataAdapter, AutoFetchDataAdapter, web worker, storage adapter, JavaScript, TypeScript
---
# Data Adapters

A data adapter decides **where a collection's data operations actually happen**.

The collection itself does not query, write or store anything. It describes the
operation — insert this item, update whatever matches that selector, keep me
posted about this query — and hands it to its data adapter. The adapter answers
it and reports back what changed.

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'

const dataAdapter = new DefaultDataAdapter()

const Posts = new Collection('posts', dataAdapter)
const Authors = new Collection('authors', dataAdapter)
```

One adapter usually serves every collection of an application. It is asked for
the storage belonging to each collection by name, which is why the collection's
name is a constructor argument rather than an option.

## Where it sits

SignalDB has three extension points, and they answer three different questions:

| | Question it answers |
| --- | --- |
| [`ReactivityAdapter`](/reactivity/) | How do I tell your framework that something changed? |
| [`DataAdapter`](/reference/core/dataadapter/) | Where do the data operations run? |
| [`StorageAdapter`](/data-persistence/) | How is a document persisted and read back? |

A data adapter is the one in the middle. Most of them take a `storage` function
and use a storage adapter underneath — the difference between them is not *what*
they store but *where and when* the work happens.

## Choosing one

### `DefaultDataAdapter`

Keeps the data in memory on the main thread and answers every query from it.
Writes are applied immediately and persisted in the background. This is the
adapter you want unless something below applies, and the one a collection
constructed without an adapter uses.

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createLocalStorageAdapter from '@signaldb/localstorage'

const dataAdapter = new DefaultDataAdapter({
  storage: name => createLocalStorageAdapter(name),
})
```

[Reference →](/reference/core/defaultdataadapter/)

### `AsyncDataAdapter`

Answers every query by going to storage, without holding the collection in
memory. Right when the data does not fit in memory, or when something else can
change the underlying storage. Queries become asynchronous, which is what
[`Cursor#isLoading()`](/reference/core/cursor/) is for.

[Reference →](/reference/core/asyncdataadapter/)

### `WorkerDataAdapter` / `WorkerDataAdapterHost`

Runs the data layer in a web worker. `WorkerDataAdapterHost` lives inside the
worker and owns the storage; `WorkerDataAdapter` lives on the main thread and
talks to it. Right when queries or writes are large enough that doing them on
the main thread costs you frames.

The two are a pair and are documented together.

[Reference →](/reference/core/workerdataadapter/)

### `AutoFetchDataAdapter`

Fetches a query's items from a remote source the first time that query is
registered, and drops them again when nothing is watching it any more. Right
for data you want to pull on demand rather than sync in full — the successor to
v1's `AutoFetchCollection`.

[Reference →](/reference/core/autofetchdataadapter/)

## Writing your own

A data adapter is one method:

```ts
import type { DataAdapter, CollectionBackend } from '@signaldb/core'

const myAdapter: DataAdapter = {
  createCollectionBackend(collection, indices) {
    // return an object implementing CollectionBackend
  },
}
```

`createCollectionBackend` is called once per collection and returns the object
that answers everything for it: the six write methods, the query registration
and reading methods, and two lifecycle methods. The full contract is on the
[`DataAdapter` reference page](/reference/core/dataadapter/).

Two things are worth knowing before you start.

**A query that has not been answered yet publishes a neutral result.** An empty
list is a legitimate answer, so a consumer cannot tell "nothing matched" from
"not answered yet" by looking at the result. `getQueryState` is what makes the
difference visible, and it is why an adapter that can fail must publish
`'error'` rather than leaving the query sitting on its empty value forever.

**A delta is a promise about the previous result.** When your adapter tells a
listener that a query completed, it may pass a
[`QueryDelta`](/reference/core/dataadapter/#querydelta) describing how the
result changed — which saves the listener from comparing the whole new result
against the whole old one. That delta must be relative to what `getQueryResult`
returned the last time it was asked. If your adapter layers anything on top of
its stored result — an optimistic write still in flight, say — omit the delta
while it does. A wrong delta is worse than no delta: it desynchronises the
consumer silently and permanently, and omitting it costs nothing but a
comparison.
