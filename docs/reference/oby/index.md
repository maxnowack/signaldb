---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/oby/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/oby/
- - meta
  - name: og:title
    content: '@signaldb/oby - SignalDB Reactivity Adapter for oby'
- - meta
  - name: og:description
    content: Discover how to integrate oby with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate oby with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, reactivity adapter, `oby`, JavaScript, TypeScript, integration guide, automatic cleanup, scope check, SignalDB plugin, real-time updates
---
# @signaldb/oby

## obyReactivityAdapter (`default`)

```js
import { Collection } from '@signaldb/core'
import obyReactivityAdapter from '@signaldb/oby'
import { effect } from 'oby'

const posts = new Collection({
  reactivity: obyReactivityAdapter,
})

effect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```

Reactivity adapter for usage with [oby](https://github.com/vobyjs/oby).
