# combinePersistenceAdapters

```ts
import { combinePersistenceAdapters } from '@signaldb/core'
```

If a SignalDB collection needs more than one persistence adapter, you can use `combinePersistenceAdapters` to combine multiple persistence adapters into one.

The `combinePersistenceAdapters` function takes a primary and a secondary adapter.
The primary adapter is typically the one that is the primary location for the data. The secondary adapter is usually one that has faster read and write times.
The function returns a new persistence adapter that combines the functionality of the two adapters.

```ts
const adapter = combinePersistenceAdapters(primaryAdapter, secondaryAdapter)
```
