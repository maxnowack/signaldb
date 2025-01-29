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

## Cursor

Cursors are a concept that appears in many database systems and are used to iterate over and access data in a controlled manner. A cursor in SignalDB is a pointer to a specific set of rows.
It provides an interface to interact with items while offering capabilities like reactivity, transformation, observation of changes, and more.

You don't have to create a cursor by yourself. SignalDB is handling that for you and returns the cursor from a [`.find()` call](/reference/core/collection/#find-selector-selector-t-options-options).

The following methods are available in the cursor class:

### ⚡️ `forEach(callback: (item: TransformedItem) => void)` *(reactive)*
Iterates over each item in the cursor, applying the given callback function.

> This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.

* Parameters:
  * `callback`: A function that gets executed for each item.

### ⚡️ `map<T> (callback: (item: TransformedItem) => T)` *(reactive)*
Maps each item in the cursor to a new array using the provided callback function.

> This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.

* Parameters:
  * `callback`: A function that transforms each item.
* Returns
  * An array of transformed items

### ⚡️ `fetch()` *(reactive)*
Fetches all the items in the cursor and returns them.

> This method is reactive, so it will rerun automatically when a document is added, removed, or when any of its fields change. You can control when it reruns by using the `fields` option in the `.find()` method to specify which fields to track. Reactivity will only be triggered by changes in the fields you choose.

* Returns
  * An array of items

### ⚡️ `count()` *(reactive)*
Counts the number of items in the cursor.

> This method is reactive, so it will rerun automatically when a document was added or removed from the query.

* Returns
  * The count of items

### `observeChanges(callbacks: ObserveCallbacks<U>, skipInitial = false)`
This method allows observation of changes in the cursor items. It uses callbacks to notify of different events like addition, removal, changes, etc.

* Parameters
  * `callbacks`: An object of Callback functions for different observation events.
    * `added(item: T)`gets called when a new item was added to the cursor
    * `addedBefore(item: T, before: T)`gets called when a new item was added to the cursor and also indicates the position of the new item
    * `changed(item: T)`gets called when an item in the cursor was changed
    * `movedBefore(item: T, before: T)`gets called when an item moved its position in the cursor
    * `removed(item: T)`gets called when an item was removed from the cursor
  * `skipInitial`: A boolean to decide whether to skip the initial observation event.
* Returns
  * A function that, when called, stops observing the changes.

### `requery()`
Re-queries the cursor to fetch items and check observers for any changes.

### `cleanup()`
The cleanup method is used to invoke all the cleanup callbacks. This helps in managing resources and ensuring efficient garbage collection. You have to call this method, if you're using a reactivity adapter, that doesn't support automatic cleanup.
