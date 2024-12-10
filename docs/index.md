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
  text: Reactive, Local-First JavaScript Database with Real-Time Sync
  tagline: Optimistic UI, Real-time sync, TypeScript support, MongoDB-like queries and signal-based reactivity every framework.
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
    title: Signal-based Reactivity!
    link: /reactivity/
    details: SignalDB offers a universal interface that works with any JavaScript framework or library. Achieve reactivity by using reactivity adapters. We provide pre-built adapters for numerous libraries including Angular, Solid.js, Preact, Vue, and others!
  - icon: <svg width="32" height="32" viewBox="0 0 120 258" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M83.0089 28.7559C72.1328 15.9086 62.7673 2.86053 60.8539 0.150554C60.6525 -0.0501848 60.3503 -0.0501848 60.1489 0.150554C58.2355 2.86053 48.8699 15.9086 37.9938 28.7559C-55.3594 147.292 52.6968 227.287 52.6968 227.287L53.6031 227.889C54.4087 240.235 56.4228 258 56.4228 258H60.451H64.4792C64.4792 258 66.4934 240.335 67.299 227.889L68.2052 227.187C68.306 227.187 176.362 147.292 83.0089 28.7559ZM60.451 225.48C60.451 225.48 55.6172 221.365 54.3081 219.257V219.057L60.1489 89.9813C60.1489 89.5798 60.7532 89.5798 60.7532 89.9813L66.594 219.057V219.257C65.2848 221.365 60.451 225.48 60.451 225.48Z" fill="#00684A"/></svg>
    title: MongoDB-like interface
    link: /queries/
    details: You don't have to learn new things. The API of SignalDB is similar to that of MongoDB. Thanks to <a href="https://github.com/kofrasa/mingo">the awesome mingo library</a>, you can use your common selectors.
  - icon: 🔄
    title: Real-Time Synchronization
    link: /sync/
    details: SignalDB’s sync feature ensures data consistency across collections and supports any backend, including REST APIs and GraphQL. It also includes built-in conflict resolution to manage data discrepancies effectively.
  - icon: 🔵
    title: simple
    link: /core-concepts/
    details: SignalDB's schema-less design and in-memory storage significantly enhance the Developer Experience by simplifying data management and ensuring rapid query performance.
  - icon: <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 166 155.3"><defs><linearGradient id="a" x1="27.5" x2="152" y1="3" y2="63.5" gradientUnits="userSpaceOnUse"><stop offset=".1" stop-color="#76b3e1"/><stop offset=".3" stop-color="#dcf2fd"/><stop offset="1" stop-color="#76b3e1"/></linearGradient><linearGradient id="b" x1="95.8" x2="74" y1="32.6" y2="105.2" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#76b3e1"/><stop offset=".5" stop-color="#4377bb"/><stop offset="1" stop-color="#1f3b77"/></linearGradient><linearGradient id="c" x1="18.4" x2="144.3" y1="64.2" y2="149.8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#315aa9"/><stop offset=".5" stop-color="#518ac8"/><stop offset="1" stop-color="#315aa9"/></linearGradient><linearGradient id="d" x1="75.2" x2="24.4" y1="74.5" y2="260.8" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#4377bb"/><stop offset=".5" stop-color="#1a336b"/><stop offset="1" stop-color="#1a336b"/></linearGradient></defs><path fill="#76b3e1" d="M163 35S110-4 69 5l-3 1c-6 2-11 5-14 9l-2 3-15 26 26 5c11 7 25 10 38 7l46 9 18-30z"/><path fill="url(#a)" d="M163 35S110-4 69 5l-3 1c-6 2-11 5-14 9l-2 3-15 26 26 5c11 7 25 10 38 7l46 9 18-30z" opacity=".3"/><path fill="#518ac8" d="m52 35-4 1c-17 5-22 21-13 35 10 13 31 20 48 15l62-21S92 26 52 35z"/><path fill="url(#b)" d="m52 35-4 1c-17 5-22 21-13 35 10 13 31 20 48 15l62-21S92 26 52 35z" opacity=".3"/><path fill="url(#c)" d="M134 80a45 45 0 0 0-48-15L24 85 4 120l112 19 20-36c4-7 3-15-2-23z"/><path fill="url(#d)" d="M114 115a45 45 0 0 0-48-15L4 120s53 40 94 30l3-1c17-5 23-21 13-34z"/></svg>
    title: Solid.js
    link: /guides/solid-js/
    details: Solid.js's granular reactivity and efficient data management provide a robust foundation for SignalDB, enabling the creation and management of signals which are core reactive primitives, thereby allowing for real-time data updates and synchronization.
  - icon: <svg width="32" height="32" viewBox="-11.5 -10.23174 23 20.46348"xmlns=http://www.w3.org/2000/svg><title>React Logo</title><circle cx=0 cy=0 fill=#61dafb r=2.05 /><g fill=none stroke=#61dafb stroke-width=1><ellipse rx=11 ry=4.2 /><ellipse rx=11 ry=4.2 transform=rotate(60) /><ellipse rx=11 ry=4.2 transform=rotate(120) /></g></svg>
    title: React
    link: /guides/react/
    details: SignalDB's reactivity adapters allow for seamless integration with signal libraries, enabling auto-updates to reactive queries whenever data changes, which aligns well with React's reactivity model.
  - icon: <svg width="32" height="32" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 261.76 226.69"><path fill="#41b883" d="m161.096.001-30.224 52.35L100.647.002H-.005L130.872 226.69 261.749 0z"/><path fill="#34495e" d="m161.096.001-30.224 52.35L100.647.002H52.346l78.526 136.01L209.398.001z"/></svg>
    title: Vue
    link: /guides/vue/
    details: Vue.js's powerful reactivity system, which allows for effortless binding and updating of the UI based on data changes, pairs well with SignalDB's reactivity adapters, creating a fusion of two reactivity paradigms and ensuring real-time data accuracy.
  - icon: 🥳
    title: and many more!
    link: /reference/core/createreactivityadapter/
    details: SignalDB is designed to be framework-agnostic, offering integration through reactivity adapters which allow it to seamlessly interface with various signal libraries, ensuring auto-updates to reactive queries when data changes; this flexibility makes it a great choice for integration with a wide range of frameworks
---
