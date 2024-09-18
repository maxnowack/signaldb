---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/data-persistence/local-storage/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/data-persistence/local-storage/
- - meta
  - name: og:title
    content: localStorage Adapter - SignalDB
- - meta
  - name: og:description
    content: Discover how to use the localStorage Adapter in SignalDB for straightforward and efficient browser data storage. Learn how to set up and manage your data collections with ease using localStorage.
- - meta
  - name: description
    content: Discover how to use the localStorage Adapter in SignalDB for straightforward and efficient browser data storage. Learn how to set up and manage your data collections with ease using localStorage.
- - meta
  - name: keywords
    content: SignalDB, localStorage adapter, data persistence, browser storage, JavaScript, TypeScript, data management, local storage, collection setup, SignalDB adapters
---
# localStorage Adapter

The localStorage Adapter is the most straightforward tool for usage within a browser setting. To initiate its use, the only step required is designating a specific name to identify your data. This named data forms a collection that will be stored in the localStorage, from which it can be loaded or saved as needed.

```js
import { createLocalStorageAdapter, Collection } from 'signaldb'

const posts = new Collection({
  persistence: createLocalStorageAdapter('posts'),
})
```
