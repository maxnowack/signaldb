---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/angular/
---
# Reactivity adapter for [`Angular Signals`](https://angular.io/guide/signals)

In Angular, the introduction of signals has revolutionized the way data changes are communicated within templates and other code components. Signals, in conjunction with SignalDB offer a seamless integration that enhances the reactivity and performance of Angular applications. SignalDB complements Angular's signal mechanism by providing a robust database solution that responds in real-time to data changes. When data in SignalDB changes, it can emit signals that Angular components can listen to, ensuring that the UI is always in sync with the underlying data. This integration not only simplifies state management but also optimizes performance by reducing unnecessary change detection cycles. Developers can leverage this synergy between Angular's signals and SignalDB to build more efficient, reactive, and user-friendly web applications.

## Adapter

* 🚧 Experimental
* ❌ Automatic Cleanup 
* ❌ Scope check

The API of Angular doesn't allow [automatic cleanup nor reactive scope checking](/reactivity/#reactivity-libraries). Adapters without automatic cleanup are considered as **experimental**, as a manual cleanup isn't really convenient and a not properly cleanup can lead to memory leaks.

```js
import { signal, untracked } from '@angular/core'
import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = signal(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep.set(untracked(() => dep() + 1))
      },
    }
  },
})
```

## Usage

```js
import { Collection } from 'signaldb'
import { effect } from '@angular/core'

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
