---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/meteor-tracker.html
---
# Reactivity adapter for [Meteor Tracker](https://docs.meteor.com/api/tracker.html)

## Adapter

```js
// import in project without meteor
import { Tracker } from 'meteor-ts-tracker'

// import in project with meteor
import { Tracker } from 'meteor/tracker'

import { createReactivityAdapter } from 'signaldb'

const reactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = new Tracker.Dependency()
    return {
      depend: () => {
        if (!Tracker.active) return
        dep.depend()
      },
      notify: () => dep.changed(),
    }
  },
  onDispose: (callback) => {
    if (!Tracker.active) return
    Tracker.onInvalidate(callback)
  },
})
```

## Usage

```js
import { Collection } from 'signaldb'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

Tracker.autorun(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
