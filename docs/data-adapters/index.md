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
change the underlying storage.

```js
import { Collection, AsyncDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new AsyncDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 1,
    schema: { posts: ['authorId'] },
  }),
  onError: error => reportToCrashReporter(error),
  retry: {
    attempts: 5,
    delay: attempt => 250 * attempt,
  },
})

const Posts = new Collection('posts', dataAdapter, { indices: ['authorId'] })
```

* `storage` is called once per collection with its name and is required.
* A query that fails is retried before it is given up: `retry.attempts` counts
  every attempt including the first (default `3`), `retry.delay` returns the
  wait in milliseconds before the next one (default `100 * 4 ** (attempt - 1)`).
  Only once every attempt has failed is the query published as failed — see
  [below](#queries-on-these-adapters-are-asynchronous).
* `onError` receives what fails inside the adapter, including a query that has
  run out of attempts. Without it, the error goes to `console.error`.

[Reference →](/reference/core/asyncdataadapter/)

### `WorkerDataAdapter` / `WorkerDataAdapterHost`

Runs the data layer in a web worker. `WorkerDataAdapterHost` lives inside the
worker and owns the storage; `WorkerDataAdapter` lives on the main thread and
talks to it. Right when queries or writes are large enough that doing them on
the main thread costs you frames.

The worker file constructs the host with the worker's global scope and the
storage:

```js
// data-worker.js
import { WorkerDataAdapterHost } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

new WorkerDataAdapterHost(self, {
  id: 'app-data',
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 1,
    schema: { posts: ['authorId'] },
  }),
  onError: error => console.error('[data worker]', error),
})
```

The main thread starts the worker and hands it to the adapter, which your
collections are then constructed with:

```js
import { Collection, WorkerDataAdapter } from '@signaldb/core'

const worker = new Worker(new URL('./data-worker.js', import.meta.url), {
  type: 'module',
})
const dataAdapter = new WorkerDataAdapter(worker, { id: 'app-data' })

const Posts = new Collection('posts', dataAdapter, { indices: ['authorId'] })
```

Both halves must use the **same `id`** — every message carries it, and each side
ignores messages with a different one. That is what lets several adapters share
a worker, or several workers share a page. If you omit it on both sides they
agree on the default, `'default-worker-data-adapter'`.

The host announces itself when it is constructed. If the main thread does not
hear from it within five seconds — the worker failed to load, or the ids do not
match — every operation of the adapter fails with
`WorkerDataAdapter initialization timed out`.

[Reference →](/reference/core/workerdataadapter/)

### `AutoFetchDataAdapter`

Fetches a query's items from a remote source the first time that query is
registered, and drops them again when nothing is watching it any more. Right
for data you want to pull on demand rather than sync in full — the successor to
v1's `AutoFetchCollection`.

```js
import { Collection, AutoFetchDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new AutoFetchDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app-cache',
    version: 1,
    schema: { posts: [] },
  }),
  fetchQueryItems: async (collectionName, selector) => {
    const query = encodeURIComponent(JSON.stringify(selector))
    const response = await fetch(`/api/${collectionName}?selector=${query}`)
    return response.json() // an array of items, each with an `id`
  },
  registerRemoteChange: async (onChange) => {
    const socket = new WebSocket('wss://example.com/changes')
    socket.addEventListener('message', () => { void onChange() })
  },
})

const Posts = new Collection('posts', dataAdapter)
```

* `storage` is the local cache the fetched items are written to and every query
  is answered from. The type marks it optional, but every operation needs it —
  without it they fail with `No storage adapter for collection <name>`.
* `fetchQueryItems(collectionName, selector)` is called when a selector is
  registered by its first observer. It must resolve to an array of items; an
  item that already exists locally is combined with the fetched one through
  `mergeItems` (default: a shallow spread, the fetched fields win).
* `registerRemoteChange` is called once, when the adapter is constructed. Call
  the `onChange` it hands you whenever the remote data changed, and every
  selector that is currently observed is fetched again.
* When the last observer of a selector goes away, the adapter waits
  `purgeDelay` milliseconds (default `10000`, `0` purges at once) and then
  removes the items that selector fetched, unless another selector that has
  not been purged yet fetched them as well. Only items a fetch delivered are purged — even if you have
  written to them since; an item that only ever came from your own writes stays.

A query is answered from the local cache first, and the fetched items arrive
afterwards as an ordinary update. `isLoading()` and an `{ async: true }` read
reflect that first, local answer — they do not wait for the fetch.

[Reference →](/reference/core/autofetchdataadapter/)

### Queries on these adapters are asynchronous

The async, worker and auto-fetch adapters cannot answer a query on the spot. A
reactive cursor serves its neutral result — an empty list, a count of zero —
until the answer arrives, so either await the result or check
[`Cursor#isLoading()`](/reference/core/cursor/#⚡️-isloading-reactive) inside the
reactive scope:

```js
// outside a reactive scope: wait for the answer
const posts = await Posts.find({ authorId: 'user1' }, { async: true }).fetch()

// inside one: tell "not answered yet" apart from "nothing matched"
effect(() => {
  const cursor = Posts.find({ authorId: 'user1' })
  if (cursor.isLoading()) return renderSpinner()
  render(cursor.fetch())
})
```

A query that fails for good does not throw anywhere — the cursor keeps its
neutral result and the collection emits
[`query.error`](/queries/#collection-events). See
[Queries that are not answered immediately](/queries/#queries-that-are-not-answered-immediately)
for the full picture.

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
