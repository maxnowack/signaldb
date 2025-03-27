---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reference/svelte/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reference/svelte/
- - meta
  - name: og:title
    content: '@signaldb/svelte - SignalDB Reactivity Adapter for Svelte 5'
- - meta
  - name: og:description
    content: Discover how SignalDB integrates with Svelte 5 to enhance reactivity and performance in Svelte applications using the reactivity adapter.
- - meta
  - name: description
    content: Discover how SignalDB integrates with Svelte Runes to enhance reactivity and performance in Svelte applications using the reactivity adapter.
- - meta
  - name: keywords
    content: SignalDB, Svelte, Svelte 5, reactivity adapter, Svelte Runes, integration, performance, state management, real-time updates, JavaScript, TypeScript
---
# @signaldb/svelte

## svelteReactivityAdapter (`default`)

```js
import { Collection } from "@signaldb/core";
import svelteReactivityAdapter from "@signaldb/svelte";

const Posts = new Collection({
  reactivity: svelteReactivityAdapter,
});

let items = $state.raw([]);
$effect(() => {
  const cursor = Posts.find({});
  items = cursor.fetch();

  return () => {
    cursor.cleanup();
  };
});
```

Reactivity adapter for usage with [Svelte 5](https://svelte.dev/).

The API of Svelte doesn't allow [automatic cleanup](/reference/core/createreactivityadapter/#ondispose-callback-void-dependency-dependency-optional).
With Svelte, you can return a function from your `$effect` that will be called on cleanup. Use this one to cleanup your cursors (see an example above).

In Svelte, reactivity is built into the very fabric of the framework, eliminating the need for manual change detection cycles. Svelte’s reactive declarations and writable stores automatically track and update state, ensuring that your UI remains consistently in sync with underlying data changes. When paired with SignalDB this natural reactivity is taken to the next level.

SignalDB seamlessly integrates with Svelte’s reactive model by emitting live data updates. As changes occur in SignalDB, those updates are immediately propagated to Svelte’s stores, triggering automatic re-rendering of affected components. This ensures that every part of your application reflects the most current data without any extra boilerplate or manual intervention.

This combination not only simplifies state management but also enhances performance by reducing unnecessary updates. Developers can leverage this synergy between Svelte’s inherent reactivity and SignalDB’s real-time capabilities to build highly efficient, responsive, and user-friendly web applications.
