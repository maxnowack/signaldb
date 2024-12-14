---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/sinuous/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/sinuous/
- - meta
  - name: og:title
    content: '@signaldb/sinuous - SignalDB Reactivity Adapter for Sinuous'
- - meta
  - name: og:description
    content: Discover how to integrate Sinuous with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate Sinuous with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, Sinuous, reactivity adapter, integration guide, JavaScript, TypeScript, reactive programming, SignalDB plugin, collection setup, automatic cleanup, memory management
---
# @signaldb/sinuous

## sinuousReactivityAdapter (`default`)

```js
import { api } from 'sinuous'
import sinuousReactivityAdapter from '@signaldb/sinuous'
import { Collection } from '@signaldb/core'

const posts = new Collection({
  reactivity: sinuousReactivityAdapter,
})

api.subscribe(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```

Reactivity adapter for usage with [sinuous](https://sinuous.netlify.app/).

The API of Sinuous doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).
