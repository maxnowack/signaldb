---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/upgrade/v1/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/upgrade/v1/
- - meta
  - name: og:title
    content: Upgrade to v1 | SignalDB
- - meta
  - name: og:description
    content: Learn how to upgrade SignalDB in your project to version 1.0.0. This guide provides step-by-step instructions and best practices for a smooth upgrade process.
- - meta
  - name: description
    content: Learn how to upgrade SignalDB in your project to version 1.0.0. This guide provides step-by-step instructions and best practices for a smooth upgrade process.
- - meta
  - name: keywords
    content: SignalDB, upgrade, v1, version 1.0.0, migration, guide, instructions, best practices, smooth upgrade process, project, SignalDB version, JavaScript database
---
# Upgrade to v1

Learn how to upgrade SignalDB in your project to version 1.0.0. This guide provides step-by-step instructions and best practices for a smooth upgrade process.

## Switch to new packages

The core, the reactivity adapters & integration packages have been renamed and moved to the `@signaldb` scope. If your application is using any of them, you need to install the new packages and update your imports.

First of all, uninstall all old packages by running the following command.

```sh
npm uninstall -S signaldb \
  signaldb-plugin-angular \
  signaldb-plugin-maverickjs \
  signaldb-plugin-meteor \
  signaldb-plugin-mobx \
  signaldb-plugin-oby \
  signaldb-plugin-preact \
  signaldb-plugin-reactively \
  signaldb-plugin-sinuous \
  signaldb-plugin-sjs \
  signaldb-plugin-solid \
  signaldb-plugin-usignal \
  signaldb-plugin-vue
```

### Core Packages

The core package has been renamed to `@signaldb/core` and the [`SyncManager`](/reference/sync/) has been moved to `@signaldb/sync`. You need to install the new packages and update your imports. `@signaldb/sync` is only needed if you're using the [sync engine](/sync/).

```sh
npm install @signaldb/core @signaldb/sync
```

```js
import { Collection, … } from '@signaldb/core'
import { SyncManager } from '@signaldb/sync'
```

### `createLocalStorageAdapter`

The `createLocalStorageAdapter` function has been moved to the `@signaldb/localstorage` package. If your application is using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/localstorage
```

```js
import createLocalStorageAdapter from '@signaldb/localstorage'
```

### `createOPFSAdapter`

The `createOPFSAdapter` function has been moved to the `@signaldb/opfs` package. If your application is using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/opfs
```

```js
import createOPFSAdapter from '@signaldb/opfs'
```

### `createFileSystemAdapter`

The `createFileSystemAdapter` function has been moved to the `@signaldb/fs` package. If your application is using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/fs
```

```js
import createFileSystemAdapter from '@signaldb/fs'
```

### React

The React integration package has been renamed to `@signaldb/react`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/react
```

```js
import createUseReactivityHook from '@signaldb/react'
```

### Angular

The Angular reactivity adapter has been renamed to `@signaldb/angular`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/angular
```
```js
import angularReactivityAdapter from '@signaldb/angular'
```

### @maverickjs/signals

The @maverickjs/signals reactivity adapter has been renamed to `@signaldb/maverickjs`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/maverickjs
```
```js
import maverickjsReactivityAdapter from '@signaldb/maverickjs'
```

### Meteor Tracker

The Meteor Tracker reactivity adapter has been renamed to `@signaldb/meteor`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/meteor
```
```js
import meteorReactivityAdapter from '@signaldb/meteor'
```

### MobX

The MobX reactivity adapter has been renamed to `@signaldb/mobx`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/mobx
```
```js
import mobxReactivityAdapter from '@signaldb/mobx'
```

### oby

The oby reactivity adapter has been renamed to `@signaldb/oby`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/oby
```
```js
import obyReactivityAdapter from '@signaldb/oby'
```

### @preact/signals

The @preact/signals reactivity adapter has been renamed to `@signaldb/preact`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/preact
```
```js
import preactReactivityAdapter from '@signaldb/preact'
```

### @reactively/core

The @reactively/core reactivity adapter has been renamed to `@signaldb/reactively`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/reactively
```
```js
import reactivelyReactivityAdapter from '@signaldb/reactively'
```

### sinuous

The sinuous reactivity adapter has been renamed to `@signaldb/sinuous`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/sinuous
```
```js
import sinuousReactivityAdapter from '@signaldb/sinuous'
```

### S.js

The S.js reactivity adapter has been renamed to `@signaldb/sjs`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/sjs
```
```js
import sjsReactivityAdapter from '@signaldb/sjs'
```

### solid

The solid reactivity adapter has been renamed to `@signaldb/solid`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/solid
```
```js
import solidReactivityAdapter from '@signaldb/solid'
```

### usignal

The usignal reactivity adapter has been renamed to `@signaldb/usignal`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/usignal
```
```js
import usignalReactivityAdapter from '@signaldb/usignal'
```

### vue

The vue reactivity adapter has been renamed to `@signaldb/vue`. If you're using it, you need to install the new package and update your imports.

```sh
npm install @signaldb/vue
```
```js
import vueReactivityAdapter from '@signaldb/vue'
```

## Remove usage of `PersistentCollection`

The `PersistentCollection` class has been removed. If your application is using it, you need to switch to the default `Collection` and use adapters to persist data.

To adapt the old logic, you can do something like this.

```js
import { Collection } from '@signaldb/core'
import createLocalStorageAdapter from '@signaldb/localstorage'
import createFileSystemAdapter from '@signaldb/fs'

const someCollection = new Collection({
  persistence: typeof window === 'undefined'
    ? createFileSystemAdapter({ path: './persistent-collection-someCollection.json' })
    : createLocalStorageAdapter({ key: 'someCollection' }),
})
```

## Switch from `ReplicatedCollection` to [`SyncManager`](/reference/sync/)

The `ReplicatedCollection` class has been removed. If your application is using it, you need to switch to the [`SyncManager`](/reference/sync/) class. Since the [`SyncManager`](/reference/sync/) uses a totally different approach, you need to update your code.

Take a look at the [SyncManager documentation](https://signaldb.js.org/sync/) to see how to use it.

## Remove options parameter from `combinePersistenceAdapters`

The `combinePersistenceAdapters` function no longer accepts an options parameter. If your application is using it, you need to remove it. The options had allowed to switch the sequence of the arguemnts, but this is no longer necessary. The first argument is the primary adapter and the second argument is the secondary adapter.

## Switch to new [`IndexProviders`](/reference/core/createindexprovider/)

Support for old custom [`IndexProviders`](/reference/core/createindexprovider/) has been removed. If your application is using them, you need to switch to the new ones. This is only necessary if you are using custom [`IndexProviders`](/reference/core/createindexprovider/). If you are using the [`createIndex`](/reference/core/createindex/) function, you don't need to do anything.

## Further help

If you need further help, please [start a discussion on Github](https://github.com/maxnowack/signaldb/discussions/new/choose), join our [Discord server](https://discord.gg/qMvXKXxBTp) or [open an issue](https://github.com/maxnowack/signaldb/issues/new).
