---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/angular/
---
# Reactivity adapter for [`Angular Signals`](https://angular.io/guide/signals)

## Adapter

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

effect(onCleanup() => {
  const cursor = posts.find({ author: 'John' })
  console.log(cursor.count())
  onCleanup(() => {
    cursor.cleanup()
  })
})
```
