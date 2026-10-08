---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/utilities/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/utilities/
- - meta
  - name: og:title
    content: Utilities | SignalDB
- - meta
  - name: og:description
    content: Helper functions exported by @signaldb/core — serializeValue, get, isEqual, modify, randomId, EventEmitter, reactiveOrAsync and unwrap.
- - meta
  - name: description
    content: Helper functions exported by @signaldb/core — serializeValue, get, isEqual, modify, randomId, EventEmitter, reactiveOrAsync and unwrap.
- - meta
  - name: keywords
    content: SignalDB, utilities, serializeValue, get, isEqual, modify, randomId, EventEmitter, reactiveOrAsync, unwrap, storage adapter
---
# Utilities

```ts
import {
  serializeValue,
  get,
  isEqual,
  modify,
  randomId,
  EventEmitter,
  reactiveOrAsync,
  unwrap,
} from '@signaldb/core'
```

`@signaldb/core` exports the helpers it uses internally that are useful when
you write an adapter or an integration of your own. They follow the same
semantics SignalDB applies itself, so an adapter built on them cannot disagree
with SignalDB about what a value or a modifier means.

## `serializeValue(value: any): string | null`

Turns a field value into the key an index is stored under: strings as they are,
numbers and booleans as their string form, dates as ISO strings, everything else
through `JSON.stringify`. `null` and `undefined` both become `null`.

A custom [`StorageAdapter`](/reference/core/createstorageadapter/#index-keys)
must key the map returned by `readIndex` with exactly this function — it is what
SignalDB looks an index up with.

```ts
serializeValue(3) // '3'
serializeValue(new Date(0)) // '1970-01-01T00:00:00.000Z'
serializeValue(undefined) // null
```

## `get(value: object, path: string)`

Reads the value at a path inside an object. Dot notation (`'author.name'`) and
bracket notation (`'tags[0]'`) are supported. Returns `undefined` if any part of
the path does not exist or the path is malformed.

```ts
get({ author: { name: 'Ada' } }, 'author.name') // 'Ada'
```

## `isEqual(a, b): boolean`

Compares two values for deep equality, including arrays, dates and regular
expressions.

```ts
isEqual({ a: [1, new Date(0)] }, { a: [1, new Date(0)] }) // true
```

## `modify(item: T, modifier: Modifier): T`

Applies a [modifier](/data-manipulation/) to an item and returns the modified
copy; the input is not mutated. A modifier without any `$` operator replaces the
item as a whole, as it does in `updateOne`.

```ts
modify({ a: 1, b: 2 }, { $set: { b: 3 } }) // { a: 1, b: 3 }
```

## `randomId(): string`

Returns a random id of 16 lowercase alphanumeric characters — the default
primary key of a collection. It uses `Math.random()` and is therefore not
suitable where an id must be unguessable.

## `EventEmitter`

The typed event emitter `Collection` is built on. Extend it with a map of event
names to listener signatures:

```ts
class Store extends EventEmitter<{
  saved: (id: string) => void,
}> {}

const store = new Store()
store.on('saved', id => console.log(id))
store.emit('saved', 'a1')
```

It offers `on`/`addListener`, `once`, `off`/`removeListener`, `emit`,
`listeners`, `listenerCount`, `removeAllListeners` and `setMaxListeners`. It
logs a warning whenever an event has more listeners than the maximum, 100 by default, which
usually points at listeners that are never removed.

## `reactiveOrAsync(generator)` and `unwrap(value)`

Build a function that can be called both ways SignalDB queries can: synchronously
— and therefore reactively — or asynchronously with `{ async: true }` as its last
argument. Write the logic once as a generator and `yield* unwrap(…)` every value
that may be a promise; `reactiveOrAsync` runs it synchronously or awaits each
yielded promise, depending on how it was called.

```ts
const getPostWithAuthor = reactiveOrAsync(function* (async: boolean, postId: string) {
  const post = yield* unwrap(Posts.findOne({ id: postId }, { async }))
  if (!post) return undefined
  const author = yield* unwrap(Authors.findOne({ id: post.authorId }, { async }))
  return { ...post, author }
})

getPostWithAuthor('p1') // synchronous and reactive
await getPostWithAuthor('p1', { async: true }) // asynchronous
```

The generator receives whether it runs asynchronously as its first argument;
pass it on to the queries it makes. Yielding a promise in synchronous mode is a
programming error and throws. The returned function exposes its generator as
`.generator`, so one such workflow can compose another with
`yield* other.generator.call(this, async, …)`.

A collection's [`transformAll`](/orm/#reading-related-data-the-way-the-query-is-read)
can be built the same way: SignalDB calls it with `{ async: true }` for an
asynchronous read and synchronously for every other one.
