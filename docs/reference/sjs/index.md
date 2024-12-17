---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/sjs/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/sjs/
- - meta
  - name: og:title
    content: '@signaldb/sjs - SignalDB Reactivity Adapter for S.js'
- - meta
  - name: og:description
    content: Learn how to integrate SignalDB with the S.js reactivity library. This guide covers installation, usage, and how to handle scope limitations with S.js.
- - meta
  - name: description
    content: Learn how to integrate SignalDB with the S.js reactivity library. This guide covers installation, usage, and how to handle scope limitations with S.js.
- - meta
  - name: keywords
    content: SignalDB, S.js, reactivity adapter, integration guide, JavaScript, reactive scope, memory leaks, real-time updates, npm package, collection setup
---
# @signaldb/sjs

## sjsReactivityAdapter (`default`)

```js
import { Collection } from '@signaldb/core'
import sjsReactivityAdapter from '@signaldb/sjs'
import S from 's-js'

const posts = new Collection({
  reactivity: sjsReactivityAdapter,
})

S(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```

Reactivity adapter for usage with [S.js](https://github.com/adamhaile/S).

The API of S.js doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).
