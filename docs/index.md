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
  text: Local-First JavaScript Database with Signal-Based Reactivity
  tagline: Build offline-capable apps that stay fast and responsive, with real-time sync across any backend.
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
    title: Signal-Based Reactive Database
    link: /reactivity/
    details: SignalDB is a <strong>Reactive Database</strong> that leverages signal-based reactivity to instantly reflect data changes in real-time. SignalDB offers a universal interface that works with any JavaScript framework or library. It provides pre-built adapters for numerous libraries including <a href="/guides/angular/">Angular</a>, <a href="/guides/solid-js/">Solid.js</a>, <a href="/guides/react/">React</a>, <a href="/guides/vue/">Vue</a>, and <a href="/reactivity/#reactivity-libraries">others</a>!
  - icon: 📍
    title: Local-First
    link: /sync/#local-first-synchronization
    details: SignalDB is a <strong>Local-First Database</strong>, meaning it prioritizes local data storage and processing. This approach ensures that your application remains responsive and functional even when offline. SignalDB automatically syncs data with the server once the connection is re-established, providing a seamless user experience.
  - icon: 🔄
    title: Real-Time Synchronization
    link: /sync/
    details: With SignalDB’s sync capabilities you can ensures data consistency between your application and your server. SignalDB provides <strong>Real-Time Synchronization</strong> that keeps your data up-to-date across all clients and servers, providing a seamless user experience. It also includes built-in conflict resolution to manage data discrepancies effectively.
  - icon: 👌
    title: Developer Friendly
    link: /core-concepts/
    details: SignalDB is designed for simplicity and ease of use. With full <strong>TypeScript</strong> support, it guarantees type safety across your application. The familiar <a href="/queries/">MongoDB-like query syntax</a> lets you use existing knowledge of selectors and operators. Additionally, the built-in <a href="/orm/">ORM</a> simplifies data modeling, letting you define relationships and handle complex data structures more easily.
  - icon: ✨
    title: Optimistic UI
    link: /core-concepts/#optimistic-ui
    details: Enhance the <strong>User Experience</strong> of your application with <strong>Optimistic UI</strong>. This provides immediate feedback to users by anticipating actions, resulting in a seamless and responsive interface even before the server confirms the changes.
  - icon: 🛠️
    title: Developer Tools
    link: /devtools/
    details: SignalDB comes with a set of <strong>Developer Tools</strong> that provide real-time debugging, query monitoring, and performance insights. These tools help you optimize your application by identifying bottlenecks and improving performance.
  - icon: 🔌
    title: Backend Agnostic
    link: /sync/#syncing-with-any-backend
    details: SignalDB is <strong>Backend Agnostic</strong>, allowing you to integrate with any server setup. Whether you are using a simple REST API or a complex GraphQL setup. SignalDB provides a universal interface that works with any backend technology.
  - icon: 💾
    title: Storage Adapters
    link: /data-persistence/
    details: SignalDB offers a versatile API for integrating Storage Adapters, enabling you to store data across various environments. Whether you’re building a web, mobile, or desktop application, SignalDB makes it easy to implement storage solutions. It also includes pre-built adapters for <strong>IndexedDB</strong>, <strong>LocalStorage</strong>, and more.
---
