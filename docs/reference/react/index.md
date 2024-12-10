# @signaldb/react

## createUseReactivityHook (`default`)

```ts
import createUseReactivityHook from '@signaldb/react'
import { effect } from '…'

const useReactivity = createUseReactivityHook(effect)
```

This function creates a custom hook that provides reactivity to your components. It takes a function as the single argument that specifies the effect function of a reactive library.
The effect function must have the following signature:

```ts
(reactiveFunction: () => void) => () => void
```

The provided function is called with a reactive function that should be executed when the reactivity changes. The returned function is the cleanup function that removes the effect.

Also check out our guide on [how to use SignalDB with React](/guides/react/).
