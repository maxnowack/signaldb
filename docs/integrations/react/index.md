---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/integrations/react/
---
# SignalDB React Integration

SignalDB can be integrated with React using the `signaldb-react` package. This package provides the necessary bindings to use SignalDB with React components.

## Installation

You can install the `signaldb-react` package using npm. Open your terminal and enter the following command:

```bash
  npm install signaldb-react
```

## Exports

The `signaldb-react` package exports the following components and hooks:

### `createUseReactivityHook`

This function creates a custom hook that provides reactivity to your components. It takes a function as the single argument that specifies the effect function of a reactive library.
The effect function must have the following signature:

```ts
(reactiveFunction: () => void) => () => void
```

The provided function is called with a reactive function that should be executed when the reactivity changes. The returned function is the cleanup function that removes the effect.
