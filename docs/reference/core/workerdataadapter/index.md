---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/workerdataadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/workerdataadapter/
- - meta
  - name: og:title
    content: WorkerDataAdapter | SignalDB
- - meta
  - name: og:description
    content: Run the SignalDB data layer in a web worker — WorkerDataAdapterHost owns the storage inside the worker, WorkerDataAdapter talks to it from the main thread.
- - meta
  - name: description
    content: Run the SignalDB data layer in a web worker — WorkerDataAdapterHost owns the storage inside the worker, WorkerDataAdapter talks to it from the main thread.
- - meta
  - name: keywords
    content: SignalDB, WorkerDataAdapter, WorkerDataAdapterHost, web worker, data adapter, off main thread, serialization, JavaScript, TypeScript
---
# WorkerDataAdapter

```ts
import { WorkerDataAdapter, WorkerDataAdapterHost } from '@signaldb/core'
```

Runs the data layer in a web worker. The two halves are a pair:

* **`WorkerDataAdapterHost`** lives inside the worker. It owns the storage adapters and does the actual querying and writing.
* **`WorkerDataAdapter`** lives on the main thread. It is the `DataAdapter` your collections are constructed with, and it forwards everything to the host.

Use it when queries or writes are large enough that doing them on the main
thread costs you frames.

## Usage

Inside the worker:

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
})
```

On the main thread:

```js
import { Collection, WorkerDataAdapter } from '@signaldb/core'

const worker = new Worker(new URL('./data-worker.js', import.meta.url), {
  type: 'module',
})

const dataAdapter = new WorkerDataAdapter(worker, { id: 'app-data' })

const Posts = new Collection('posts', dataAdapter, {
  indices: ['authorId'],
})
```

The `id` on both sides must match — it is how messages are routed when several
adapters share a worker or several workers share a page.

## `WorkerDataAdapter`

```ts
new WorkerDataAdapter(worker: WorkerDataAdapterEndpoint, options: {
  id?: string
  log?: (message: string, ...args: any[]) => void
})
```

`WorkerDataAdapterEndpoint` is the part of the `Worker` interface this adapter
uses, so anything with the same shape works — a `MessagePort`, a
`SharedWorker`'s port, or a stub in a test:

```ts
interface WorkerDataAdapterEndpoint {
  addEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void
  removeEventListener: (type: 'message', listener: (event: MessageEvent) => void) => void
  postMessage: (message: unknown) => void
  terminate?: () => void
}
```

## `WorkerDataAdapterHost`

```ts
new WorkerDataAdapterHost(context: WorkerDataAdapterHostEndpoint, options: {
  id?: string
  storage: (name: string) => StorageAdapter<any, any>
  onError?: (error: Error) => void
  log?: (message: string, ...args: any[]) => void
})
```

* `storage`: Called once per collection with the collection's name. Required.
* `onError`: Called when something fails inside the worker. Worth wiring up — an error thrown in a worker with nowhere to go is invisible from the main thread.

## Queries are asynchronous

Every answer crosses a message boundary, so a query is not answered the moment
you ask for it. As with the
[`AsyncDataAdapter`](/reference/core/asyncdataadapter/), the cursor serves its
neutral empty result until then, and
[`Cursor#isLoading()`](/reference/core/cursor/) is what tells that apart from a
query that matched nothing.

A write, though, is shown immediately. While it is in flight the adapter layers
it onto the results it holds, so your UI does not wait for the round trip.

There is one exception. An item the adapter knows only through a **projected**
query — one using `fields` — is not shown optimistically. Applying a modifier to
an item that has had fields removed produces something that is not the item, and
a selector naming a projected-away field would no longer match it. The write
still happens; it simply becomes visible when the worker answers rather than
immediately.

## The message boundary is a cost

Everything crossing between the two halves is serialized on its way out and
deserialized on the consumer's main thread. The work behind a message happens in
the worker; the *size* of the message does not.

That is why the host sends the full result only the first time a query is
answered, and only what changed after that, and why a write that leaves a
query's result unchanged produces no message at all. If you write your own
adapter across such a boundary, do the same — see
[the delta contract](/reference/core/dataadapter/#the-delta-contract).

Projecting a query with `fields` is the other lever: it is the difference
between sending a row and sending the two columns you render.
