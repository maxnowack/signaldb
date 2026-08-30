---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/dataadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/dataadapter/
- - meta
  - name: og:title
    content: DataAdapter | SignalDB
- - meta
  - name: og:description
    content: The DataAdapter contract in SignalDB — CollectionBackend, QueryOptions, StateChangeCallback and QueryDelta, and what a custom data adapter has to uphold.
- - meta
  - name: description
    content: The DataAdapter contract in SignalDB — CollectionBackend, QueryOptions, StateChangeCallback and QueryDelta, and what a custom data adapter has to uphold.
- - meta
  - name: keywords
    content: SignalDB, DataAdapter, CollectionBackend, QueryOptions, StateChangeCallback, QueryDelta, custom data adapter, TypeScript, JavaScript, extension point
---
# DataAdapter

```ts
import type {
  DataAdapter,
  CollectionBackend,
  QueryOptions,
  StateChangeCallback,
  QueryDelta,
} from '@signaldb/core'
```

The interface a [data adapter](/data-adapters/) implements. See the
[data adapters](/data-adapters/) chapter for what an adapter is and which of the
built-in ones to pick.

## `DataAdapter`

```ts
interface DataAdapter {
  createCollectionBackend<T, I, E, U>(
    collection: Collection<T, I, E, U>,
    indices: string[],
  ): CollectionBackend<T, I>
}
```

Called once per collection. `indices` are the field names the collection was
constructed with; an adapter that cannot use indices may ignore them.

## `CollectionBackend`

The object that answers everything for one collection.

### Writes

```ts
insert(item: T): Promise<T>
updateOne(selector: Selector<T>, modifier: Modifier<T>): Promise<WriteResult<T>>
updateMany(selector: Selector<T>, modifier: Modifier<T>): Promise<WriteResult<T>>
replaceOne(selector: Selector<T>, replacement: Omit<T, 'id'> & Partial<Pick<T, 'id'>>): Promise<WriteResult<T>>
removeOne(selector: Selector<T>): Promise<T[]>
removeMany(selector: Selector<T>): Promise<T[]>
```

Each resolves to the items it affected. An empty result means nothing matched —
which is what turns an upsert into an insert, so it has to be accurate.

The three updating writes resolve to a `WriteResult<T>`:

```ts
type WriteResult<T> = T[] | { items: T[], previousItems: T[] }
```

Returning the items on their own is still valid, so an existing adapter keeps
compiling and behaving as before. An adapter that also knows what the items
looked like *before* the write returns the object form instead, and the
collection's `'changed'` event then carries that previous state as its third
argument. `previousItems[n]` is what `items[n]` was before the write, so an
adapter that reports it reports it for every item it changed.

### Queries

```ts
registerQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void
unregisterQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void
retryQuery?<O extends QueryOptions<T>>(selector: Selector<T>, options: O): void
getQueryState<O extends QueryOptions<T>>(selector: Selector<T>, options: O): 'active' | 'complete' | 'error'
getQueryError<O extends QueryOptions<T>>(selector: Selector<T>, options: O): Error | null
getQueryResult<O extends QueryOptions<T>>(selector: Selector<T>, options: O): T[]
executeQuery<O extends QueryOptions<T>>(selector: Selector<T>, options: O): Promise<T[]>
onQueryStateChange<O extends QueryOptions<T>>(
  selector: Selector<T>,
  options: O,
  callback: StateChangeCallback<T>,
): () => void
```

`registerQuery` starts a live query; the returned function of
`onQueryStateChange` unsubscribes. `getQueryResult` is synchronous and must
always return something — see [the neutral result](#the-neutral-result) below.

`retryQuery` is optional so that existing custom adapters keep compiling. An
adapter that never surfaces an `'error'` state has nothing to implement.

### Lifecycle

```ts
dispose(): Promise<void>
isReady(): Promise<void>
```

## `QueryOptions`

```ts
interface QueryOptions<T> {
  sort?: SortSpecifier<T>
  skip?: number
  limit?: number
  fields?: FieldSpecifier<T>
}
```

## `StateChangeCallback`

```ts
type StateChangeCallback<T> = (
  state: 'active' | 'complete' | 'error',
  delta?: QueryDelta<T>,
) => void
```

The second argument is optional and only ever accompanies `'complete'`. An
adapter that can describe the change passes it; one that cannot omits it, and
its listeners fall back to comparing the whole result against the previous one.

## `QueryDelta`

```ts
interface QueryDelta<T> {
  /** Items that were not in the previous result, at their position in the new one. */
  added: { index: number, item: T }[]
  /** Items that were in the previous result and whose contents changed. */
  changed: T[]
  /** Ids of items that are no longer in the result. */
  removed: any[]
  /** Items that stayed, at their new position, because the order around them changed. */
  moved: { index: number, id: any }[]
  /** Length of the resulting array. */
  resultCount: number
}
```

`resultCount` lets a recipient verify it applied the delta to the result it was
computed against. A recipient whose own length disagrees falls back to
re-reading the query rather than serving a result it cannot trust.

## What a custom adapter has to uphold

### The neutral result

A query that has not been answered yet publishes an empty list, and that empty
list is indistinguishable from a real one — because empty is a legitimate
answer. `getQueryState` is the only thing that tells the two apart, and
[`Cursor#isLoading()`](/reference/core/cursor/) is how a consumer sees it.

Two consequences. Publish `'complete'` only once you actually have the answer,
not when you start looking for it. And if your adapter can fail, publish
`'error'` and record the reason in `getQueryError` — a query left sitting on its
neutral value is a consumer staring at an empty screen with nothing to tell them
why.

### The delta contract

A delta is only ever passed when it is relative to what `getQueryResult`
returned the last time it was asked.

If your adapter layers anything on top of its stored result — an optimistic
write still in flight, for instance — it must omit the delta for as long as it
does, because the listener's last result included that layer and your delta does
not describe it.

A wrong delta is worse than no delta. Omitting it costs the listener one
comparison; getting it wrong desynchronises them silently and permanently.

### Cost

The cost of a write should scale with the size of the *change*, not with the
size of the data or of the results on screen. That is what the delta is for. An
adapter that answers every write by re-running each affected query and diffing
the results works correctly and gets slower the more the application shows.

For an adapter across a serialization boundary — a worker, a socket — the
message *size* is a cost paid on the consumer's thread even though the work
behind it is not. Send deltas rather than results.
