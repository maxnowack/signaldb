---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/asyncdataadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/asyncdataadapter/
- - meta
  - name: og:title
    content: AsyncDataAdapter | SignalDB
- - meta
  - name: og:description
    content: The SignalDB data adapter that answers every query from storage instead of holding the collection in memory — for data that does not fit, or that something else can change.
- - meta
  - name: description
    content: The SignalDB data adapter that answers every query from storage instead of holding the collection in memory — for data that does not fit, or that something else can change.
- - meta
  - name: keywords
    content: SignalDB, AsyncDataAdapter, data adapter, asynchronous queries, storage adapter, isLoading, retry, JavaScript, TypeScript
---
# AsyncDataAdapter

```ts
import { AsyncDataAdapter } from '@signaldb/core'
```

Answers every query by going to the [storage adapter](/data-persistence/),
without holding the collection in memory.

Use it when the data does not fit in memory, or when something other than this
process can change the underlying storage and you need the answer to reflect
that.

## Usage

```js
import { Collection, AsyncDataAdapter } from '@signaldb/core'
import createFileSystemAdapter from '@signaldb/fs'

const dataAdapter = new AsyncDataAdapter({
  storage: name => createFileSystemAdapter(`./data/${name}`),
})

const Posts = new Collection('posts', dataAdapter)
```

## Options

```ts
new AsyncDataAdapter(options: {
  storage: (name: string) => StorageAdapter<any, any>
  id?: string
  onError?: (error: Error) => void
  retry?: {
    attempts?: number
    delay?: (attempt: number) => number
  }
})
```

* `storage`: Called once per collection with the collection's name, and returns the storage adapter it reads from. Required — an async adapter with nothing to read from has nothing to do.
* `id`: A logical name, handy when several adapters run side by side.
* `onError`: Called when an operation fails outside of a query.
* `retry.attempts`: Total attempts for a failing query, including the first. Default `3`.
* `retry.delay`: Delay in milliseconds before attempt N+1. Default `100 * 4 ** (attempt - 1)`.

## Queries are asynchronous

A query is not answered the moment you ask for it, which changes two things.

Until it is answered, the cursor returns its neutral result — an empty list, a
count of zero — and that is indistinguishable from a query that legitimately
matched nothing. Use
[`Cursor#isLoading()`](/reference/core/cursor/) to tell the two apart:

```js
const cursor = Posts.find({ status: 'published' })

effect(() => {
  if (cursor.isLoading()) return renderSpinner()
  renderPosts(cursor.fetch())
})
```

And a query can fail. That is what `retry` is for: a query that fails is
otherwise a dead end for the rest of the session, because cursors only requery
on completion and would keep serving that neutral empty value. After the
attempts are used up the query is published as failed, which reaches the
collection's [`query.error`](/reference/core/collection/#events) event.

## Indices

Only the fields a collection declares as `indices` can narrow a query down
before it reaches storage. This matters more here than with the
[`DefaultDataAdapter`](/reference/core/defaultdataadapter/): an unindexed
selector means reading the whole collection out of storage on every query, not
just scanning an array already in memory.
