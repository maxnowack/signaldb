---
layout: home

title: SignalDB
titleTemplate: reactive local javascript database

head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/
- - meta
  - name: og:type
    content: website
- - meta
  - name: og:url
    content: https://signaldb.js.org/
- - meta
  - name: og:title
    content: SignalDB - Reactive Local-First JavaScript Database
- - meta
  - name: og:description
    content: SignalDB is a reactive, local-first JavaScript database with real-time sync, Optimistic UI and signal-based reactivity.
- - meta
  - name: description
    content: SignalDB is a reactive, local-first JavaScript database with real-time sync, Optimistic UI and signal-based reactivity
- - meta
  - name: keywords
    content: signaldb, local first, real time, live updates, MongoDB-like, sync, reactive, JavaScript, TypeScript, database, Angular, Solid.js, React, Vue, Svelte, GraphQL, REST API, optimistic UI, framework agnostic, adapters, signals, schema-less

hero:
  name: SignalDB
  text: Reactive Local-First JavaScript Database
  tagline: Signals for instant UI updates, plus real-time sync when you need it.
  image:
    src: /logo.svg
    alt: SignalDB Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started/
    - theme: alt
      text: View on GitHub
      link: https://github.com/maxnowack/signaldb

features:
  - icon: ⚡️
    title: Signal-Based Reactivity
    link: /reactivity/
    details: SignalDB is a <strong>reactive JavaScript database</strong> powered by signals for instant UI updates. Works with any framework, with adapters for <a href="/guides/angular/">Angular</a>, <a href="/guides/solid-js/">Solid.js</a>, <a href="/guides/react/">React</a>, <a href="/guides/vue/">Vue</a>, and more.
  - icon: 📍
    title: Local-First
    link: /sync/#local-first-synchronization
    details: A <strong>local-first database</strong> that keeps apps fast and usable offline. Data syncs automatically when you’re back online for a smooth offline-first experience.
  - icon: 🔄
    title: Real-Time Synchronization
    link: /sync/
    details: Built-in <strong>real-time sync</strong> keeps data consistent across clients and servers. Includes conflict handling for reliable collaborative and multi-device apps.
  - icon: 👌
    title: Developer Friendly
    link: /core-concepts/
    details: Full <strong>TypeScript</strong> support with a familiar <a href="/queries/">MongoDB-like query</a> API. Model relationships easily with the built-in <a href="/orm/">ORM</a>.
  - icon: ✨
    title: Optimistic UI
    link: /core-concepts/#optimistic-ui
    details: Ship snappy apps with <strong>optimistic UI</strong>—updates render instantly while sync runs in the background.
  - icon: 🛠️
    title: Developer Tools
    link: /devtools/
    details: Use <strong>devtools</strong> to inspect queries, changes, and performance in real time. Debug faster and spot bottlenecks early.
  - icon: 🔌
    title: Backend Agnostic
    link: /sync/#syncing-with-any-backend
    details: Sync works with REST, GraphQL, or custom APIs. Plug into your existing server without rewrites.
  - icon: 💾
    title: Storage Adapters
    link: /data-persistence/
    details: Persist data anywhere with flexible <strong>storage adapters</strong>. Includes support for <strong>IndexedDB</strong>, <strong>OPFS</strong>, and more.
---

<SyncExample />

## What is SignalDB?

SignalDB is an open-source, **reactive local JavaScript database**. Your app keeps its data in collections on the client, queries them with a MongoDB-like API, and gets results that update automatically through the signals of the framework you already use. Data is persisted locally ([IndexedDB, OPFS, localStorage](/data-persistence/)) and synchronized with [any backend](/sync/) in the background.

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createIndexedDBAdapter from '@signaldb/indexeddb'

const dataAdapter = new DefaultDataAdapter({
  storage: createIndexedDBAdapter({
    databaseName: 'my-app',
    version: 1,
    schema: { posts: ['published'] },
  }),
})

const posts = new Collection('posts', dataAdapter)

await posts.insert({ title: 'Hello SignalDB', published: true })
posts.find({ published: true }).fetch() // reactive inside your framework's effects
```

## When to use a local-first JavaScript database

A client-side database like SignalDB is a good fit when:

- the UI should react **instantly** to user actions ([optimistic UI](/optimistic-ui/)) instead of waiting for the server;
- the app should **keep working offline** and sync later ([offline-first](/offline-first/), [local-first](/local-first/));
- several views show **the same data** and must stay consistent without manual cache updates;
- you want **real-time updates** from your existing REST, GraphQL or WebSocket API without changing the backend.

## How SignalDB compares

SignalDB focuses on signal-based reactivity, a familiar MongoDB-style query API and backend-agnostic sync. See the [JavaScript database comparison](/comparison/) for how it relates to RxDB, Dexie.js, PouchDB, WatermelonDB, TinyBase and TanStack DB, or read [JavaScript Signals Explained](/signals/) for the reactivity model behind it.

[Get started →](/getting-started/)
