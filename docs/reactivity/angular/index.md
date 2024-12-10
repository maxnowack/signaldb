---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/angular/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reactivity/angular/
- - meta
  - name: og:title
    content: SignalDB Reactivity Adapter for Angular Signals
- - meta
  - name: og:description
    content: Discover how SignalDB integrates with Angular's signals to enhance reactivity and performance in Angular applications using the reactivity adapter.
- - meta
  - name: description
    content: Discover how SignalDB integrates with Angular's signals to enhance reactivity and performance in Angular applications using the reactivity adapter.
- - meta
  - name: keywords
    content: SignalDB, Angular, reactivity adapter, Angular signals, integration, performance, state management, real-time updates, JavaScript, TypeScript
---
# Reactivity adapter for [`Angular Signals`](https://angular.io/guide/signals)

In Angular, the introduction of signals has revolutionized the way data changes are communicated within templates and other code components. Signals, in conjunction with SignalDB offer a seamless integration that enhances the reactivity and performance of Angular applications. SignalDB complements Angular's signal mechanism by providing a robust database solution that responds in real-time to data changes. When data in SignalDB changes, it can emit signals that Angular components can listen to, ensuring that the UI is always in sync with the underlying data. This integration not only simplifies state management but also optimizes performance by reducing unnecessary change detection cycles. Developers can leverage this synergy between Angular's signals and SignalDB to build more efficient, reactive, and user-friendly web applications.

## Adapter

* ❌ Automatic Cleanup
* ❌ Scope check

The API of Angular doesn't allow [automatic cleanup](/reactivity/other/#ondispose-callback-void-dependency-dependency) nor [reactive scope checking](/reactivity/other/#isinscope-dependency-dependency-boolean).
In Angular, the function passed to the `effect()` function gets a `onCleanup` callback that can be used to cleanup the effect. You can use this to cleanup the cursor (see an example below).
You also must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

## Installation

```bash
  $ npm install @signaldb/angular
```

## Usage

```js
import { Collection } from '@signaldb/core'
import { effect } from '@angular/core'
import reactivityAdapter from '@signaldb/angular'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect((onCleanup) => {
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
  onCleanup(() => {
    cursor.cleanup()
  })
})
```
