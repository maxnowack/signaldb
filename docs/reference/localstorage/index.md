---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/localstorage/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/localstorage/
- - meta
  - name: og:title
    content: '@signaldb/localstorage | SignalDB'
- - meta
  - name: og:description
    content: Discover how to use the localStorage Adapter in SignalDB for straightforward and efficient browser data storage.
- - meta
  - name: description
    content: Discover how to use the localStorage Adapter in SignalDB for straightforward and efficient browser data storage.
- - meta
  - name: keywords
    content: SignalDB, localStorage adapter, data persistence, browser storage, JavaScript, TypeScript, data management, local storage, collection setup, SignalDB adapters
---
# @signaldb/localstorage

## createLocalStorageAdapter (`default`)

```js
import { Collection, DefaultDataAdapter } from '@signaldb/core'
import createLocalStorageAdapter from '@signaldb/localstorage'

const dataAdapter = new DefaultDataAdapter({
  storage: name => createLocalStorageAdapter(name),
})

const Posts = new Collection('posts', dataAdapter)
```

Function to create a localStorage adapter for use with a collection.
The localStorage Adapter is the most straightforward tool for usage within a browser setting. To initiate its use, the only step required is designating a specific name to identify your data. This named data forms a collection that will be stored in the localStorage, from which it can be loaded or saved as needed.

A data adapter asks its `storage` function for one adapter per collection and
passes the collection's name, which is why the function above simply hands that
name on.

### Parameters

- `name` - A unique name for the collection. It becomes part of the localStorage keys.
- `options` - (Optional) Configuration object with the following properties:
  - `databaseName` - (Optional) Prefix shared by every key this adapter writes, so several independent databases can live in the same origin.
  - `serialize` - (Optional) Turns the stored value into a string. Default is `JSON.stringify`.
  - `deserialize` - (Optional) Reads that string back. Default is `JSON.parse`.
