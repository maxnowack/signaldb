---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/cursor/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/cursor/
- - meta
  - name: og:title
    content: Cursor | SignalDB
- - meta
  - name: og:description
    content: Cursors in SignalDB are a pointer to a specific set of rows. They provide an interface to interact with items while offering capabilities like reactivity, transformation, observation of changes, and more.
- - meta
  - name: description
    content: Cursors in SignalDB are a pointer to a specific set of rows. They provide an interface to interact with items while offering capabilities like reactivity, transformation, observation of changes, and more.
- - meta
  - name: keywords
    content: SignalDB, Cursor, reactive, transformation, observation, reactivity, JavaScript, TypeScript, database, reactivity, reactivity adapters, field-level reactivity
---
# Cursor

Cursors are a concept that appears in many database systems and are used to iterate over and access data in a controlled manner. A cursor in SignalDB is a pointer to a specific set of rows.
It provides an interface to interact with items while offering capabilities like reactivity, transformation, observation of changes, and more.

You don't have to create a cursor by yourself. SignalDB is handling that for you and returns the cursor from a [`.find()` call](/reference/core/collection/#find-selector-selector-t-options-options).

The following methods are available in the cursor class:

## ⚡️ `forEach(callback: (item: TransformedItem) => void)` *(reactive)*
Iterates over each item in the cursor, applying the given callback function.

* Parameters:
  * `callback`: A function that gets executed for each item.

::: tip Reactive ⚡️
This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.
:::

## ⚡️ `map<T> (callback: (item: TransformedItem) => T)` *(reactive)*
Maps each item in the cursor to a new array using the provided callback function.

* Parameters:
  * `callback`: A function that transforms each item.
* Returns
  * An array of transformed items

::: tip Reactive ⚡️
This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.
:::

## ⚡️ `fetch()` *(reactive)*
Fetches all the items in the cursor and returns them.

* Returns
  * An array of items

::: tip Reactive ⚡️
This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.
:::

## ⚡️ `count()` *(reactive)*
Counts the number of items in the cursor.

* Returns
  * The count of items

::: tip Reactive ⚡️
This method is reactive, so it will rerun automatically when a document was added or removed from the query.
:::

## ⚡️ `isLoading()` *(reactive)*
Reports whether the query behind this cursor has produced an outcome yet.

* Returns
  * `true` while the query has not been answered, `false` once it has completed or failed

This is the only thing that tells "still loading" apart from "nothing matched".
A query that has not been answered yet publishes a **neutral** result — an empty
array from `fetch()`, a zero from `count()` — and that result is
indistinguishable from a real one, because empty is a legitimate answer.

```js
const cursor = Posts.find({ status: 'published' })

effect(() => {
  if (cursor.isLoading()) return renderSpinner()
  renderPosts(cursor.fetch())
})
```

Whether it is ever `true` depends on the [data adapter](/data-adapters/). With
the [`DefaultDataAdapter`](/reference/core/defaultdataadapter/) queries are
answered from memory, so it is `false` once the collection is ready. With the
[async](/reference/core/asyncdataadapter/),
[worker](/reference/core/workerdataadapter/) and
[auto-fetch](/reference/core/autofetchdataadapter/) adapters there is a real
window in which it is `true`.

A query that *failed* is not loading either — `isLoading()` returns `false` and
the cursor keeps serving its empty result. Listen for the collection's
[`query.error`](/reference/core/collection/#events) event to catch that case.

::: tip Reactive ⚡️
This method is reactive, so it reruns automatically when the query's state changes.
:::

## `observeChanges(callbacks: ObserveCallbacks<U>, skipInitial = false)`
This method allows observation of changes in the cursor items. It uses callbacks to notify of different events like addition, removal, changes, etc.

* Parameters
  * `callbacks`: An object of Callback functions for different observation events.
    * `added(item: T)`gets called when a new item was added to the cursor
    * `addedBefore(item: T, before: T)`gets called when a new item was added to the cursor and also indicates the position of the new item
    * `changed(item: T)`gets called when an item in the cursor was changed
    * `movedBefore(item: T, before: T)`gets called when an item moved its position in the cursor. Only the items that have to move are reported: reordering a list can leave several items at a different index while a single move produces that order, and it is that single move you are told about.
    * `removed(item: T)`gets called when an item was removed from the cursor
  * `skipInitial`: A boolean to decide whether to skip the initial observation event.
* Returns
  * A function that, when called, stops observing the changes.

## `requery()`
Re-queries the cursor to fetch items and check observers for any changes.

## `applyDelta(delta: QueryDelta<T>)`
Brings the cursor up to date from a description of what changed, rather than by
re-running the query and comparing the result with the previous one.

* Parameters
  * `delta`: The change, as described by [`QueryDelta`](/reference/core/dataadapter/#querydelta)

Falls back to `requery()` when the delta does not fit the result the cursor
currently holds, so a caller never has to decide which of the two is safe. The
delta has to be relative to the cursor's current result — see
[the delta contract](/reference/core/dataadapter/#the-delta-contract).

You rarely call this yourself. It exists for integrations that receive deltas
from a data adapter and want to avoid the comparison a `requery()` would cost.

## `onCleanup(callback: () => void)`
Registers a function to run when the cursor is cleaned up.

* Parameters
  * `callback`: The function to run

## `cleanup()`
The cleanup method is used to invoke all the cleanup callbacks. This helps in managing resources and ensuring efficient garbage collection. You have to call this method, if you're using a reactivity adapter, that doesn't support automatic cleanup.
