---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/maverickjs/
---
# Reactivity adapter for [`@maverick-js/signals`](https://github.com/maverick-js/signals)

Maverick.js's signals provide a powerful foundation for reactive programming, and their integration with signaldb showcases this strength vividly. Signals, in essence, are observables in maverick.js that let you store state and react to changes in real-time. When paired with signaldb, developers can gain the advantage of seamlessly creating reactive databases. The maverick.js reactivity adapter for signaldb simplifies this integration. By utilizing the reactivity adapter, the bridge between maverick.js signals and signaldb is streamlined, making it easier for developers to set up and maintain reactivity across their applications. This integration ensures that the data stays up-to-date, responsive, and efficient, all while adhering to the "lazy principle" that advocates for maximum efficiency with minimal burden on the developer. Whether you're looking to build robust UI libraries or simply want a lightweight solution for enhanced reactivity, integrating maverick.js's signals with signaldb via the reactivity adapter is a step in the right direction.

## Adapter

* ✅ Automatic Cleanup 
* ✅ Scope check

```bash
  $ npm install signaldb-adapter-maverickjs
```

## Usage

```js
import { effect } from '@maverick-js/signals'
import reactivityAdapter from 'signaldb-adapter-maverickjs'
import { Collection } from 'signaldb'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
