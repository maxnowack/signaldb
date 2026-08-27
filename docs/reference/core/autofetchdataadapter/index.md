---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/core/autofetchdataadapter/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/core/autofetchdataadapter/
- - meta
  - name: og:title
    content: AutoFetchDataAdapter | SignalDB
- - meta
  - name: og:description
    content: The SignalDB data adapter that fetches a query's items from a remote source on demand and drops them again when nothing watches the query any more.
- - meta
  - name: description
    content: The SignalDB data adapter that fetches a query's items from a remote source on demand and drops them again when nothing watches the query any more.
- - meta
  - name: keywords
    content: SignalDB, AutoFetchDataAdapter, AutoFetchCollection, on-demand fetching, remote data, data adapter, purgeDelay, JavaScript, TypeScript
---
# AutoFetchDataAdapter

```ts
import { AutoFetchDataAdapter } from '@signaldb/core'
```

Fetches a query's items from a remote source the first time that query is
registered, and drops them again a while after nothing is watching it any more.

Use it for data you want to pull on demand rather than synchronise in full. This
is the successor to v1's `AutoFetchCollection`; see the
[upgrade guide](/upgrade/v2/) if you are migrating from it.

If you want the whole collection kept in step with a server instead, you want
[`@signaldb/sync`](/sync/).

## Usage

```js
import { Collection, AutoFetchDataAdapter } from '@signaldb/core'

const dataAdapter = new AutoFetchDataAdapter({
  fetchQueryItems: async (collectionName, selector) => {
    const response = await fetch(`/api/${collectionName}?q=${encodeURIComponent(JSON.stringify(selector))}`)
    return response.json()
  },
})

const Posts = new Collection('posts', dataAdapter)

// Registering this query is what triggers the fetch.
const cursor = Posts.find({ authorId: 'user1' })
```

## Options

```ts
new AutoFetchDataAdapter(options: {
  fetchQueryItems: (
    collectionName: string,
    selector: Selector<BaseItem>,
  ) => Promise<BaseItem[] | undefined>
  storage?: (name: string) => StorageAdapter<any, any>
  id?: string
  onError?: (error: Error) => void
  registerRemoteChange?: (onChange: () => Promise<void>) => Promise<void>
  mergeItems?: <T>(a: T, b: T) => T
  purgeDelay?: number
})
```

* `fetchQueryItems`: Retrieves the items matching a selector from the remote source. Required. The items it resolves to **must** carry an `id`.
* `storage`: Called once per collection with the collection's name, and returns the [storage adapter](/data-persistence/) fetched items are cached in.
* `id`: A logical name, handy when several adapters run side by side.
* `onError`: Called when a fetch fails.
* `registerRemoteChange`: Called once at construction. Invoke the callback it hands you whenever the remote source changed and every active query should be re-fetched — a websocket message, a server-sent event.
* `mergeItems`: How a freshly fetched item is merged with the one already held. Default is a shallow spread with the fresh item winning.
* `purgeDelay`: Milliseconds to wait after a query becomes inactive before its items are purged. `0` purges immediately. Default `10000`.

## The result is not there yet

The fetch happens after the query is registered, so the cursor serves its
neutral empty result until the answer arrives — and an empty result is a
legitimate answer, which makes the two indistinguishable. Use
[`Cursor#isLoading()`](/reference/core/cursor/):

```js
const cursor = Posts.find({ authorId: 'user1' })

effect(() => {
  if (cursor.isLoading()) return renderSpinner()
  renderPosts(cursor.fetch())
})
```

## purgeDelay

Items fetched for a query are dropped `purgeDelay` milliseconds after the last
cursor on that query goes away. The delay exists because navigating away from a
view and back again is common, and re-fetching what you had a second ago is
waste.

Raise it if your users move between views quickly. Lower it, or set it to `0`,
if holding the data costs more than fetching it again.
