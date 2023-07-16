---
layout: home

title: SignalDB
titleTemplate: reactive local javascript database

hero:
  name: SignalDB
  text: reactive local javascript database
  tagline: MongoDB-like interface, first-class typescript support and signal based reactivity, with your favorite library.
  image:
    src: /logo.svg
    alt: SignalDB Logo
  actions:
    - theme: brand
      text: Get Started
      link: /getting-started
    - theme: alt
      text: Installation
      link: /installation

features:
  - icon: ⚡️
    title: Reactivity
    details: SignalDB provides reactive data access that works with your preferred signal library such as <a href="https://github.com/preactjs/signals">@preact/signals-core</a> or <a href="https://www.solidjs.com/guides/reactivity">solid-js</a>. There is also a simple abstraction layer with that you can fastly build your own connector.
  - icon: <svg width="32" height="32" viewBox="0 0 120 258" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M83.0089 28.7559C72.1328 15.9086 62.7673 2.86053 60.8539 0.150554C60.6525 -0.0501848 60.3503 -0.0501848 60.1489 0.150554C58.2355 2.86053 48.8699 15.9086 37.9938 28.7559C-55.3594 147.292 52.6968 227.287 52.6968 227.287L53.6031 227.889C54.4087 240.235 56.4228 258 56.4228 258H60.451H64.4792C64.4792 258 66.4934 240.335 67.299 227.889L68.2052 227.187C68.306 227.187 176.362 147.292 83.0089 28.7559ZM60.451 225.48C60.451 225.48 55.6172 221.365 54.3081 219.257V219.057L60.1489 89.9813C60.1489 89.5798 60.7532 89.5798 60.7532 89.9813L66.594 219.057V219.257C65.2848 221.365 60.451 225.48 60.451 225.48Z" fill="#00684A"/></svg>
    title: MongoDB-like interface
    details: You don't have to learn new things. The API of SignalDB is similar to that of MongoDB. Thanks to <a href="https://github.com/kofrasa/mingo">the awesome mingo library</a>, you can use your common selectors.
  - icon: <svg width="32" height="32" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg" xml:space="preserve"><path fill="#3178c6" d="M0 0h256v256H0z"/><path fill="#fff" fill-rule="evenodd" d="M150.5 200.5v27.6c4.5 2.3 9.8 4 15.9 5.2s12.6 1.7 19.4 1.7c6.6 0 12.9-.6 18.9-1.9s11.2-3.4 15.7-6.3 8-6.7 10.7-11.4c2.6-4.7 3.9-10.5 3.9-17.4 0-5-.7-9.4-2.2-13.2s-3.7-7.1-6.5-10.1c-2.8-2.9-6.2-5.6-10.1-7.9-3.9-2.3-8.4-4.5-13.3-6.6-3.6-1.5-6.9-2.9-9.8-4.4-2.9-1.4-5.3-2.8-7.3-4.3s-3.6-3-4.7-4.7-1.6-3.5-1.6-5.6c0-1.9.5-3.6 1.5-5.1s2.4-2.8 4.1-3.9c1.8-1.1 4-1.9 6.6-2.5 2.6-.6 5.5-.9 8.6-.9 2.3 0 4.7.2 7.3.5 2.6.3 5.1.9 7.7 1.6 2.6.7 5.1 1.6 7.6 2.7 2.4 1.1 4.7 2.4 6.8 3.8v-25.8c-4.2-1.6-8.8-2.8-13.8-3.6s-10.7-1.2-17.1-1.2c-6.6 0-12.8.7-18.7 2.1-5.9 1.4-11 3.6-15.5 6.6-4.5 3-8 6.8-10.6 11.4-2.6 4.6-3.9 10.2-3.9 16.6 0 8.2 2.4 15.2 7.1 21.1 4.8 5.8 12 10.7 21.6 14.8 3.8 1.6 7.3 3.1 10.6 4.6 3.3 1.5 6.1 3 8.5 4.7s4.3 3.4 5.7 5.3 2.1 4.1 2.1 6.5c0 1.8-.4 3.4-1.3 5-.9 1.5-2.2 2.8-3.9 4s-3.9 2-6.6 2.6-5.7.9-9.2.9c-6 0-11.9-1.1-17.8-3.2-5.9-2-11.4-5.1-16.4-9.3zm-46-68.8H140V109H41v22.7h35.3V233h28.1V131.7z" clip-rule="evenodd"/></svg>
    title: TypeScript
    details: SignalDB is built from ground up with TypeScript to provide you type safeness while you develop.
  - icon: 📝
    title: Data Persistance
    details: To keep things fast and simple, SignalDB stores all data in memory. However, you can plugin a persistence adapter to save your data in other places
---
