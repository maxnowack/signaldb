---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/guides/svelte/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/guides/svelte/
- - meta
  - name: og:title
    content: Using SignalDB with Svelte 5
- - meta
  - name: og:description
    content: Discover how to integrate SignalDB into your Svelte project. This guide covers the initial setup and building a reactive component with Svelte runes.
- - meta
  - name: description
    content: Discover how to integrate SignalDB into your Svelte project. This guide covers the initial setup and building a reactive component with Svelte runes.
- - meta
  - name: keywords
    content: SignalDB, Svelte 5, integration guide, reactivity, JavaScript, TypeScript, Svelte runes, SignalDB plugin, collection setup, reactive components, real-time updates
---
# Using SignalDB with Svelte 5

This guide explains how to integrate SignalDB into a Svelte 5 project. You’ll learn how to set up SignalDB collections and use Svelte's runes to manage and display data.

## Prerequisites

Before you start, make sure you’re familiar with Svelte basics and have a Svelte 5 project ready to go. If you’re new to Svelte 5, you can take a look at the [Svelte 5 Documentation](https://svelte-5-preview.vercel.app/docs/introduction) to get started.

A basic understanding of signal-based reactivity will also be helpful. You can read more about it on the [Core Concepts](/core-concepts/#signals-and-reactivity) page and the [Svelte runes blog post](https://svelte.dev/blog/runes) to understand how reactivity works.

## Installation

First, you need to install SignalDB in your project. Open your terminal and run:

```bash
npm install @signaldb/core
```

Next, install the [Svelte-specific reactivity adapter for SignalDB](/reference/svelte/):

```bash
npm install @signaldb/svelte
```

## Setting Up SignalDB

Once you’ve installed SignalDB, the next step is to set up your collections. Here's how you can define a `Posts` collection with the reactivity configuration for Svelte:

```js
import { Collection } from "@signaldb/core";
import svelteReactivityAdapter from "@signaldb/svelte";

const Posts = new Collection({
  reactivity: svelteReactivityAdapter,
});

let items = $directive(Posts.find({}).fetch());
```

This code sets up a `Posts` collection and enables reactivity using Svelte’s built-in reactivity features.

## Creating a Svelte Component

Now let's create a component that lists posts and allows the user to add new ones. Here's an example:

```svelte
<script>
  import { Collection } from "@signaldb/core";
  import svelteReactivityAdapter from "@signaldb/svelte";

  const Posts = new Collection({
    reactivity: svelteReactivityAdapter,
  });

  let items = $directive(Posts.find({}).fetch());
</script>

<button onclick={() => Posts.insert({ title: 'Post', author: 'Author' })}>
  Add Post
</button>

<ul>
  {#each items as post}
    <li>
      <strong>{post.title}</strong> by {post.author}
    </li>
  {/each}
</ul>
```

### Explanation:

1. **Reactive Items List**: The `items` array is set using Svelte's reactivity system, and the component automatically updates when the `Posts` collection changes.
2. **UI Interaction**: Clicking the "Add Post" button inserts a new post into the `Posts` collection, which triggers the component to update.
3. **Rendering Posts**: The component renders a list of posts using the `#each` directive, displaying the post title and author.

## Web Worker Compatibility

When using SignalDB with Svelte 5 in applications that utilize web workers, the standard reactivity setup can fail in production builds. This happens because Svelte's runes like `$state` aren't defined in web worker contexts.

To solve this issue, specify the reactivity adapter only if you're not in a web worker environment:

Then use this adapter in your collection setup:

```js
import { Collection } from "@signaldb/core";
import svelteReactivityAdapter from "@signaldb/svelte";
import { svelteReactivityAdapter } from "./your-adapter-file";

// Check if we're in a web worker
const isWebWorker =
  typeof self !== "undefined" &&
  typeof WorkerGlobalScope !== "undefined" &&
  self instanceof WorkerGlobalScope;

const Posts = new Collection({
  reactivity: isWebWorker ? undefined : svelteReactivityAdapter,
});
```

This approach ensures your SignalDB collections work properly both in the main thread and in web workers.

## Conclusion

You’ve now learned how to set up SignalDB in a Svelte project and create a reactive component to display and add posts. By leveraging Svelte’s reactivity, you can efficiently manage data and create dynamic user interfaces with SignalDB.

## Next Steps

Now that you’ve learned how to use SignalDB in Svelte, you maybe want to explore the possibilities how you can synchronize the data with your backend.
Take a look at the [Synchronization Overview](/sync/) to get started
