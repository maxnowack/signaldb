---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/
- - meta
  - name: og:title
    content: Reference | SignalDB
- - meta
  - name: og:description
    content: Explore the comprehensive reference for SignalDB, including core components, integrations, persistence adapters, and reactivity adapters to enhance your projects.
- - meta
  - name: description
    content: Explore the comprehensive reference for SignalDB, including core components, integrations, persistence adapters, and reactivity adapters to enhance your projects.
- - meta
  - name: keywords
    content: SignalDB, API reference, core components, integrations, persistence adapters, reactivity adapters, data management, JavaScript, TypeScript, SyncManager, collections, reactivity
---
# Reference

SignalDB consists of several packages of which each has indiviudal exports.

## Base

### `@signaldb/core`

* [`Collection`](/reference/core/collection/)
* [`Cursor`](/reference/core/cursor/)
* [`AutoFetchCollection`](/reference/core/autofetchcollection/)
* [`createIndex`](/reference/core/createindex/)
* [`createIndexProvider`](/reference/core/createindexprovider/)
* [`createMemoryAdapter`](/reference/core/creatememoryadapter/)
* [`createStorageAdapter`](/reference/core/createstorageadapter/)
* [`createReactivityAdapter`](/reference/core/createreactivityadapter/)

### `@signaldb/sync`
* [`SyncManager`](/reference/sync/)

## Integrations

### `@signaldb/react`
* [`createUseReactivityHook`](/reference/react/)

## Persistence Adapters

### `@signaldb/fs`
* [`createFileSystemAdapter`](/reference/fs/)

### `@signaldb/localstorage`
* [`createLocalStorageAdapter`](/reference/localstorage/)

### `@signaldb/opfs`
* [`createOPFSAdapter`](/reference/opfs/)

## Reactivity Adapters

### `@signaldb/angular`
* [`angularReactivityAdapter`](/reference/angular/)

### `@signaldb/maverickjs`
* [`maverickjsReactivityAdapter`](/reference/maverickjs/)

### `@signaldb/meteor`
* [`meteorReactivityAdapter`](/reference/meteor/)

### `@signaldb/mobx`
* [`mobxReactivityAdapter`](/reference/mobx/)

### `@signaldb/oby`
* [`obyReactivityAdapter`](/reference/oby/)

### `@signaldb/preact`
* [`preactReactivityAdapter`](/reference/preact/)

### `@signaldb/reactively`
* [`reactivelyReactivityAdapter`](/reference/reactively/)

### `@signaldb/sinuous`
* [`sinuousReactivityAdapter`](/reference/sinuous/)

### `@signaldb/sjs`
* [`sjsReactivityAdapter`](/reference/sjs/)

### `@signaldb/solid`
* [`solidReactivityAdapter`](/reference/solid/)

### `@signaldb/usignal`
* [`usignalReactivityAdapter`](/reference/usignal/)

### `@signaldb/vue`
* [`vueReactivityAdapter`](/reference/vue/)
