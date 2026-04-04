---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/electron/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/electron/
- - meta
  - name: og:title
    content: '@signaldb/electron | SignalDB'
- - meta
  - name: og:description
    content: API reference for @signaldb/electron — an IPC bridge for using SignalDB persistence adapters across Electron's main and renderer processes.
- - meta
  - name: description
    content: API reference for @signaldb/electron — an IPC bridge for using SignalDB persistence adapters across Electron's main and renderer processes.
- - meta
  - name: keywords
    content: SignalDB, Electron, IPC, persistence adapter, main process, renderer process, preload, contextBridge
---
# @signaldb/electron

An IPC bridge that lets renderer processes use SignalDB Collections backed by persistence adapters running in the main process. The package has three entry points — one for each Electron process context.

Also check out our guide on [how to use SignalDB with Electron](/guides/electron/).

## setupSignalDBMain

*Import from `@signaldb/electron/main`*

```ts
import { Collection } from '@signaldb/core'
import { setupSignalDBMain } from '@signaldb/electron/main'
import createFilesystemAdapter from '@signaldb/fs'

const Posts = new Collection({
  persistence: createFilesystemAdapter('./data/posts.json'),
})

const signalDB = setupSignalDBMain(ipcMain)
signalDB.addCollection(Posts, { name: 'posts' })

// Collections are fully usable in the main process
const allPosts = Posts.find().fetch()
```

Registers IPC handlers in the main process that bridge Collection instances to renderer processes. Collections are added via `addCollection` and remain fully usable in the main process — you can query, insert, update, and remove items directly.

### Parameters

- `ipcMain` — Electron's `ipcMain` module (or any object with `handle` and `removeHandler` methods)

### Returns

`{ addCollection(collection, options): void, dispose(): void }`

- `addCollection(collection, { name })` — Register a Collection instance under the given name. The `name` must match what renderers pass to `createElectronAdapter`.
- `dispose()` — Remove all IPC handlers and clean up event listeners.

### Behavior

- `load` requests return the current items from the collection via `find().fetch()`
- `save` requests apply the changeset to the collection (inserts, updates, removes)
- When a renderer calls `register`, the main process listens for `added`, `changed`, and `removed` events on the collection and fans out the current state to all subscribed windows
- Changes made directly in the main process also propagate to subscribed renderers
- Event listeners are only attached while there are active subscribers
- When a `WebContents` is destroyed, it is automatically removed from subscribers
- Throws if a renderer requests an unknown collection name

## setupSignalDBPreload

*Import from `@signaldb/electron/preload`*

```ts
import { contextBridge, ipcRenderer } from 'electron'
import { setupSignalDBPreload } from '@signaldb/electron/preload'

setupSignalDBPreload(ipcRenderer, contextBridge)
```

Exposes a `window.signaldb` bridge object via `contextBridge.exposeInMainWorld()`.

### Parameters

- `ipcRenderer` — Electron's `ipcRenderer` module (or any object with `invoke`, `on`, and `removeListener` methods)
- `contextBridge` — Electron's `contextBridge` module (or any object with `exposeInMainWorld`)

### Bridge Shape

The exposed `window.signaldb` object has the following methods:

| Method | Signature | Description |
|---|---|---|
| `load` | `(collectionName: string) => Promise<LoadResponse>` | Load collection data |
| `save` | `(collectionName: string, items: any[], changes: Changeset) => Promise<void>` | Save items and changeset |
| `register` | `(collectionName: string) => Promise<void>` | Subscribe to change notifications |
| `unregister` | `(collectionName: string) => Promise<void>` | Unsubscribe from change notifications |
| `onChange` | `(callback: (payload) => void) => () => void` | Listen for change events; returns a cleanup function |

## createElectronAdapter

*Import from `@signaldb/electron/renderer`*

```ts
import { Collection } from '@signaldb/core'
import { createElectronAdapter } from '@signaldb/electron/renderer'

const Posts = new Collection({
  persistence: createElectronAdapter('posts'),
})
```

Creates a `PersistenceAdapter` that proxies all calls through the `window.signaldb` IPC bridge.

### Parameters

- `collectionName` — The name of the collection. Must match a key passed to `setupSignalDBMain` in the main process.

### Returns

A `PersistenceAdapter` with `load`, `save`, `register`, and `unregister` methods that delegate to the bridge.

### Behavior

- Throws if `window.signaldb` is not available (i.e., `setupSignalDBPreload` was not called in the preload script)
- Filters incoming `onChange` events by `collectionName`, so each adapter only receives changes for its own collection
- Works with any reactivity adapter — pass it as the `reactivity` option on the Collection as usual

## IPC Protocol

All communication uses Electron's `ipcMain.handle` / `ipcRenderer.invoke` pattern with the following channels:

| Channel | Direction | Purpose |
|---|---|---|
| `signaldb:load` | renderer → main | Load collection data |
| `signaldb:save` | renderer → main | Save items + changeset |
| `signaldb:register` | renderer → main | Subscribe to changes |
| `signaldb:unregister` | renderer → main | Unsubscribe |
| `signaldb:change` | main → renderer | Push onChange notifications |

All payloads include a `collectionName` field for multiplexing multiple collections over the same channels.
