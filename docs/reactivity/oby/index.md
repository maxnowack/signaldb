---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/oby/
---
# Reactivity adapter for [`oby`](https://github.com/vobyjs/oby)

## Adapter

* ✅ Automatic Cleanup
* ✅ Scope check

## Installation

```bash
  $ npm install signaldb-plugin-oby
```

## Usage

```js
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-oby'
import { effect } from 'oby'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

effect(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
