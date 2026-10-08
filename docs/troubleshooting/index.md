---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/troubleshooting/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/troubleshooting/
- - meta
  - name: og:title
    content: Troubleshooting SignalDB - Common Issues and Solutions
- - meta
  - name: og:description
    content: Find solutions for SignalDB issues, from installation and instance creation to data persistence and reactivity challenges, in this troubleshooting guide.
- - meta
  - name: description
    content: Find solutions for SignalDB issues, from installation and instance creation to data persistence and reactivity challenges, in this troubleshooting guide.
- - meta
  - name: keywords
    content: SignalDB, troubleshooting, common issues, installation problems, data persistence, reactivity, error solutions, JavaScript database, SignalDB issues, help, support
---
# Troubleshooting

In this section, we've compiled some common issues you might encounter while using SignalDB and their respective solutions. Keep in mind, that you can always [file an issue](https://github.com/maxnowack/signaldb/issues/new) at our [Github Repository](https://github.com/maxnowack/signaldb).

## Unable to install SignalDB
**Problem:** You may encounter issues during the installation of SignalDB using npm.

**Solution:** Make sure you have Node.js and npm installed correctly on your machine. You can verify this by running node -v and npm -v in your terminal. Both commands should return a version number. If not, you'll need to install Node.js and npm.

## Errors when creating a new SignalDB instance
**Problem:** You may get errors when trying to create a new instance of SignalDB.

**Solution:** Check the arguments passed to the `Collection` constructor — `new Collection(name, dataAdapter, options)` — and to the data adapter. Ensure that all required options are present and are of the correct type. If you're using a custom Storage Adapter, Data Adapter or Reactivity Adapter, verify that it correctly implements its interface.

## Problems with data persistence
**Problem:** You may notice that your data is not persisting across sessions or application reloads.

**Solution:** Verify that the collection's data adapter has a `storage` option that returns a [Storage Adapter](/data-persistence/) for the collection — a `DefaultDataAdapter` without one keeps the data in memory only. If you wrote your own storage adapter, check its `setup`, `readAll`, `insert`, `replace` and `remove` methods for any errors or unexpected behavior. If you're using a built-in adapter like the localStorage adapter, check if there are any limitations, like storage quotas, that might be affecting your application.

## Issues with reactivity
**Problem:** Reactive queries aren't updating when the data changes.

**Solution:** Check your Reactivity Adapter and ensure it's working correctly. If you're using a custom adapter, ensure that it correctly implements the Reactivity Adapter interface. Make sure the depend and notify methods in your signals are correctly registering dependencies and notifying them when data changes.

## Data not saving to the desired location
**Problem:** Data isn't being saved to the location specified in your Storage Adapter.

**Solution:** Double-check the implementation of your write methods in your Storage Adapter. Make sure it correctly writes to the intended location.

## Unhandled promise rejection after a write
**Problem:** A write seems to do nothing, or the console reports an unhandled promise rejection, for example after a [schema validation](/schema-validation/) failed.

**Solution:** Every write — `insert`, `updateOne`, `removeMany` and the rest — is asynchronous and reports failure by rejecting its promise. A validation error thrown from a `validate` listener, a write to a disposed collection, or a storage adapter that failed to persist the change all end up there. Await the write and handle the error where you make it:

```js
try {
  await Posts.insert({ title: '' })
} catch (error) {
  showValidationMessage(error)
}
```

A write you neither await nor give a `.catch()` turns its failure into an unhandled rejection that is easy to miss.

## Error: "No storage adapter for collection &lt;name&gt;"
**Problem:** Operations on a collection fail with `No storage adapter for collection <name>`.

**Solution:** The `AsyncDataAdapter`, the `AutoFetchDataAdapter` and the `WorkerDataAdapterHost` read and write everything through a storage adapter, and this collection has none. Check that the `storage` option is set and that the function returns a storage adapter for *this* collection's name — a factory that only knows some names returns `undefined` for the others. (Leaving the option out altogether is fine for the `AutoFetchDataAdapter`, which then caches in memory.) The error also appears for operations that were still running when the collection was disposed. (The `DefaultDataAdapter` never throws it: without storage it simply keeps the collection in memory.)

## A list is empty although there is data
**Problem:** A reactive query renders an empty list or a count of zero, at least for a moment, even though matching items exist.

**Solution:** With the async, worker and auto-fetch [data adapters](/data-adapters/), a query is not answered the moment you ask for it. Until it is, the cursor returns a neutral result — an empty list, a count of zero — that looks exactly like a query that matched nothing. Check [`Cursor#isLoading()`](/reference/core/cursor/#⚡️-isloading-reactive) in the same reactive scope and only render "nothing found" once it is `false`, or use `{ async: true }` and await the result outside a reactive scope. See [Queries that are not answered immediately](/queries/#queries-that-are-not-answered-immediately).

## A query stays empty without throwing
**Problem:** A query stays empty for good, `isLoading()` has turned `false`, and no error was thrown anywhere.

**Solution:** The query may have failed. A failed query does not throw into your code — there is no call that could receive the error — so its cursor keeps serving the neutral empty result. The collection reports the failure through its `query.error` event:

```js
Posts.on('query.error', (error, selector, options) => {
  reportToCrashReporter(error)
})
```

The `AsyncDataAdapter` and the `AutoFetchDataAdapter` usually also pass the error to their `onError` option, which logs it to the console by default, but the event is the one place every failed query reaches. See [Collection events](/queries/#collection-events).

## Console: "Cursor.depend() called outside of a reactive scope without async option"
**Problem:** The console shows `Cursor.depend() called outside of a reactive scope without async option; consider using { async: true } or wrapping in a reactive scope`.

**Solution:** A query was read synchronously — `fetch()`, `count()`, `findOne()` or another cursor method without `async: true` — outside of a reactive scope. Synchronous reads belong inside an `effect`, an `autorun` or a component's render, where the scope reruns when the result changes. Everywhere else, pass `async: true` and await the result:

```js
const post = await collection.findOne({ id: 'abc' }, { async: true })
```

A collection without a reactivity adapter is always read this way. See [Reactive or awaited](/queries/#reactive-or-awaited).

## Console: "Error during storage operation in collection &lt;name&gt;"
**Problem:** The console shows `Error during storage operation in collection <name>`, and data saved in an earlier session is missing.

**Solution:** The `DefaultDataAdapter` logs this when the storage adapter of that collection failed to set up or to load the stored items. `collection.ready()` rejects with the same error and `isReady()` stays `false`; the collection keeps working in memory, but without the stored items, and a `SyncManager` refuses to sync it. The logged error says what went wrong — often a storage quota, a blocked database upgrade or a corrupt record. To handle it yourself instead of logging it, pass `onError` to the adapter; it receives the collection name and the error:

```js
const dataAdapter = new DefaultDataAdapter({
  storage: name => createLocalStorageAdapter(name),
  onError: (collectionName, error) => reportToCrashReporter(error),
})
```

## The application has slowly grown sluggish
**Problem:** Nothing is obviously wrong, no single operation is slow, but the application feels heavier than it used to.

**Solution:** Look for live queries holding far more rows than anything on screen. A reactive query registered from a long-lived place — a module scope, a store, a component that is never unmounted — keeps its cost for the lifetime of the application, and there is nothing to see while it happens: the query works, it is simply expensive on every write.

```js
import { Collection } from '@signaldb/core'

Collection.reportLargeQueries(500)
```

Each query holding more than that many rows is reported once, together with the stack that registered it, which is what tells you where it came from. [`Collection.enableDebugMode()`](/reference/core/collection/#enabledebugmode) switches this on at 500 rows along with query timings.

Two things usually fix what it finds: give the query a `limit` if the UI only shows a page of it, and project it with `fields` if the UI only renders a few columns.

If you're facing an issue not covered in this guide, please feel free to [raise an issue](https://github.com/maxnowack/signaldb/issues/new) on the SignalDB GitHub page. Include a clear description of your problem, steps to reproduce it, and any error messages you're seeing. The more information you provide, the easier it will be for the community to assist you.
