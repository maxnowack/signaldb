---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/guides/electron/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/guides/electron/
- - meta
  - name: og:title
    content: Use SignalDB with Electron
- - meta
  - name: og:description
    content: Learn how to integrate SignalDB with Electron. This guide covers setting up an IPC bridge so renderer processes can use reactive Collections backed by persistence adapters running in the main process.
- - meta
  - name: description
    content: Learn how to integrate SignalDB with Electron. This guide covers setting up an IPC bridge so renderer processes can use reactive Collections backed by persistence adapters running in the main process.
- - meta
  - name: keywords
    content: SignalDB, Electron, IPC, main process, renderer process, persistence, desktop app, reactive, TypeScript, offline-first
---
# Use SignalDB with Electron

In this guide, you will learn how to use SignalDB in an Electron application. Electron's security model separates the main process from renderer processes, so persistence adapters (filesystem, etc.) must run in the main process while your UI code runs in the renderer. The `@signaldb/electron` package creates a transparent IPC bridge between the two, so your Collections in the renderer behave identically to local ones.

## Prerequisites

We assume you already have a basic Electron project with a main process, a preload script, and a renderer process. If you don't, follow the [Electron Quick Start](https://www.electronjs.org/docs/latest/tutorial/quick-start) to set one up.

You should also have [context isolation](https://www.electronjs.org/docs/latest/tutorial/context-isolation) enabled (the default since Electron 12), as `@signaldb/electron` uses `contextBridge` to safely expose the IPC bridge to the renderer.

## Installation

Install SignalDB core and the Electron integration:

```bash
  npm install @signaldb/core @signaldb/electron
```

You will also need a persistence adapter for the main process. For example, to persist data to the filesystem:

```bash
  npm install @signaldb/fs
```

And a reactivity adapter for the renderer. For example, if you are using React:

```bash
  npm install @maverick-js/signals @signaldb/maverickjs @signaldb/react
```

## Setting Up the Main Process

In your main process entry file, call `setupSignalDBMain` to initialize the IPC bridge, then register each Collection with `addCollection`. The `name` must match what renderers will reference. The collections are fully usable in the main process — you can query, insert, update, and remove items directly.

```js
// main.js
import { app, BrowserWindow, ipcMain } from 'electron'
import { Collection } from '@signaldb/core'
import { setupSignalDBMain } from '@signaldb/electron/main'
import createFilesystemAdapter from '@signaldb/fs'

const Posts = new Collection({
  persistence: createFilesystemAdapter('./data/posts.json'),
})
const Users = new Collection({
  persistence: createFilesystemAdapter('./data/users.json'),
})

const signalDB = setupSignalDBMain(ipcMain)
signalDB.addCollection(Posts, { name: 'posts' })
signalDB.addCollection(Users, { name: 'users' })

// You can query collections directly in the main process
ipcMain.handle('get-post-count', () => {
  return Posts.find().fetch().length
})

app.whenReady().then(() => {
  const win = new BrowserWindow({
    webPreferences: {
      preload: './preload.js',
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  win.loadFile('index.html')
})
```

`setupSignalDBMain` returns an object with `addCollection()` and `dispose()` methods. Call `addCollection` to register each collection, and `dispose()` if you need to tear down the bridge.

## Setting Up the Preload Script

In your preload script, call `setupSignalDBPreload` to expose the IPC bridge to the renderer as `window.signaldb`:

```js
// preload.js
import { contextBridge, ipcRenderer } from 'electron'
import { setupSignalDBPreload } from '@signaldb/electron/preload'

setupSignalDBPreload(ipcRenderer, contextBridge)
```

That's all the preload needs. The bridge exposes only the specific SignalDB IPC methods — no arbitrary IPC access is granted to the renderer.

## Using Collections in the Renderer

In the renderer, create collections with `createElectronAdapter` as the persistence adapter. The collection name must match a key from the main process setup.

```js
// renderer.js
import { Collection } from '@signaldb/core'
import maverickReactivityAdapter from '@signaldb/maverickjs'
import { createElectronAdapter } from '@signaldb/electron/renderer'

const Posts = new Collection({
  persistence: createElectronAdapter('posts'),
  reactivity: maverickReactivityAdapter,
})

const Users = new Collection({
  persistence: createElectronAdapter('users'),
  reactivity: maverickReactivityAdapter,
})

export { Posts, Users }
```

From here, use the collections exactly like any other SignalDB collection — `find`, `insert`, `update`, `remove` all work as expected. Persistence is handled transparently via IPC.

## Multiple Windows

The IPC bridge supports multiple renderer windows out of the box. When a collection changes (whether from a renderer or directly in the main process), all subscribed windows receive the update. When a window is closed or its `WebContents` is destroyed, it is automatically unsubscribed — no manual cleanup is needed.

## Conclusion

You have set up a full SignalDB persistence pipeline across Electron's process boundary. The main process owns the Collections and can query them directly, the preload script bridges IPC safely, and the renderer uses proxy Collections that stay in sync automatically.

## Next Steps

- Choose a persistence adapter for the main process: [Filesystem](/reference/fs/), [IndexedDB](/reference/indexeddb/), or [build your own](/reference/core/createpersistenceadapter/)
- Add [Synchronization](/sync/) to keep data in sync with a backend
- See the full [API Reference](/reference/electron/) for `@signaldb/electron`
