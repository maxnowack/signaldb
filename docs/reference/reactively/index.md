---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/reactively/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/reactively/
- - meta
  - name: og:title
    content: '@signaldb/reactively - SignalDB Reactivity Adapter for @reactively/core'
- - meta
  - name: og:description
    content: Discover how to integrate Reactively with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate Reactively with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, Reactively, reactivity adapter, integration guide, JavaScript, TypeScript, reactive programming, SignalDB plugin, collection setup, reactive scope
---
# @signaldb/reactively

## reactivelyReactivityAdapter (`default`)

```js
import { reactive } from '@reactively/core'
import { Collection } from '@signaldb/core'
import reactivelyReactivityAdapter from '@signaldb/reactively'

const posts = new Collection({
  reactivity: reactivelyReactivityAdapter,
})

reactive(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```


Reactivity adapter for usage with [@reactively/core](https://github.com/modderme123/reactively).

The API of Reactively doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).
