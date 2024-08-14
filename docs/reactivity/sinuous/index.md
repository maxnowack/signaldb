---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/sinuous/
---
# Reactivity adapter for [`sinuous`](https://sinuous.netlify.app/)

## Adapter

* ✅ Automatic Cleanup
* ❌ Scope check

The API of Sinuous doesn't allow [reactive scope checking](/reactivity/#reactivity-libraries).
You must manually disable reactivity when making calls outside a reactive scope to avoid memory leaks. You can do this by passing `{ reactive: false }` to your options (e.g. `<collection>.find({ ... }, { reactive: false })`).

```bash
  $ npm install signaldb-plugin-sinuous
```

## Usage

```js
import { api } from 'sinuous'
import reactivityAdapter from 'signaldb-plugin-sinuous'
import { Collection } from 'signaldb'

const posts = new Collection({
  reactivity: reactivityAdapter,
})

api.subscribe(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
