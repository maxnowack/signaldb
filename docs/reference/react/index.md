---
title: '@signaldb/react: React Bindings for SignalDB'
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/react/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/react/
- - meta
  - name: og:title
    content: '@signaldb/react: React Bindings for SignalDB'
- - meta
  - name: og:description
    content: How createUseReactivityHook from @signaldb/react turns the effect function of a signal library into a useReactivity hook that re-renders React components when SignalDB query results change.
- - meta
  - name: description
    content: How createUseReactivityHook from @signaldb/react turns the effect function of a signal library into a useReactivity hook that re-renders React components when SignalDB query results change.
- - meta
  - name: keywords
    content: SignalDB, React, @signaldb/react, createUseReactivityHook, useReactivity, React hook, reactivity adapter, signals, real-time updates, JavaScript
---
# @signaldb/react

## createUseReactivityHook

```ts
import { createUseReactivityHook } from '@signaldb/react'
import { effect } from '…'

const useReactivity = createUseReactivityHook(effect)
```

This function creates a custom hook that provides reactivity to your components. It takes a function as the single argument that specifies the effect function of a reactive library.
The effect function must have the following signature:

```ts
(reactiveFunction: () => void) => () => void
```

The provided function is called with a reactive function that should be executed when the reactivity changes. The returned function is the cleanup function that removes the effect.

### Return value

`createUseReactivityHook` returns the `useReactivity` hook:

```ts
useReactivity<T>(reactiveFunction: () => T, deps?: DependencyList): T
```

- `reactiveFunction` - Runs inside the effect of your reactive library. Its return value is what the hook returns, and the component re-renders whenever a reactive dependency read inside it changes.
- `deps` - (Optional) A React dependency list. When one of its values changes, the effect is stopped and `reactiveFunction` runs again in a new one. Default is `[]`.

The effect is stopped when the component unmounts.

```jsx
const PostList = ({ author }) => {
  const posts = useReactivity(() => Posts.find({ author }).fetch(), [author])
  return <ul>{posts.map(post => <li key={post.id}>{post.title}</li>)}</ul>
}
```

Also check out our guide on [how to use SignalDB with React](/guides/react/).
