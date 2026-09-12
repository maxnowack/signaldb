---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/reactivetransaction/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/reactivetransaction/
- - meta
  - name: og:title
    content: reactiveTransaction | SignalDB
- - meta
  - name: og:description
    content: Group several writes that belong to one operation so every reactive scope updates once, at the end, instead of once per write phase.
- - meta
  - name: description
    content: Group several writes that belong to one operation so every reactive scope updates once, at the end, instead of once per write phase.
- - meta
  - name: keywords
    content: SignalDB, reactiveTransaction, batch, reactivity, notifications, re-render, transaction, performance
---
# reactiveTransaction

```ts
import { reactiveTransaction } from '@signaldb/core'
```

Runs a callback as one **reactive transaction**: every reactive scope that would
have been notified while it runs is notified once, after it ends.

```js
await reactiveTransaction(async () => {
  await applyCatch()   // writes the log rows
  await runFollower()  // derives the counts from them
}) // → every screen reading either of them updates once, here
```

Without it, an operation made of several phases wakes its readers once per
phase. The user did one thing; the screen re-rendered three times.

## How it differs from `batch`

`Collection.batch()` defers the **query pipeline**: while it is open, no cursor
requeries at all. That makes it right for a handful of writes issued together,
and wrong for anything longer — it has to stay synchronous and short, because
everything reading a collection is frozen for its duration.

`reactiveTransaction` holds only the last step, the notification of reactive
scopes. Queries keep running, results stay current, observers keep diffing; what
waits is the wake-up.

|  | `Collection.batch()` | `reactiveTransaction()` |
| --- | --- | --- |
| Defers | requeries *and* notifications | notifications only |
| Reads inside it | serve the value from before the batch | current |
| May span `await`s | no, in practice — everything is frozen meanwhile | yes, that is the point |
| Nesting | passthrough: the inner one is a no-op | joins the outer one |
| Right for | writes issued together, in one tick | an operation with phases |

They compose: a transaction may contain several batches, which is what a real
pipeline looks like.

## Behaviour

- **Nesting joins.** An inner transaction does not flush; the outermost one
  does. A pipeline can open one without knowing whether its caller already did.
- **Overlap holds.** While *any* transaction is open, notifications are held,
  and they are flushed when the last one ends. A scope may be woken later than
  its own transaction ended, never earlier.
- **A throw still flushes.** Whatever was written before the failure is real, so
  its readers are notified. A transaction that swallowed its notifications on
  failure would leave a screen showing state that is no longer in the database.
- **Once per scope.** A transaction that touched one query fifty times wakes it
  once.
- **A disposed query is not woken.** A cursor cleaned up while a transaction is
  open is dropped from it.
- **Synchronous in, synchronous out.** A synchronous callback returns its value
  directly and flushes before returning.

## `isInReactiveTransaction()`

```ts
import { isInReactiveTransaction } from '@signaldb/core'
```

Returns whether a reactive transaction is currently open. Useful for diagnostics
and for code that wants to behave differently while notifications are held.

::: warning
A transaction that never settles holds notifications for the rest of the
process: nothing reactive updates again. Keep the callback's promise on a path
that always resolves or rejects.
:::
