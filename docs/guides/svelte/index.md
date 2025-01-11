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

As Svelte runes have to be used inline, there isn't an easy way to provide a prebuilt adapter. Therefore you have to add a few lines in your code to specify the adapter during collection initialization.

## Setting Up SignalDB

Once you’ve installed SignalDB, the next step is to set up your collections. Here's how you can define a `Posts` collection with a custom reactivity configuration for Svelte:

```js
<script>
  import { Collection } from "@signaldb/core";

  const Posts = new Collection({
    reactivity: {
      create() {
        let dep = $state(0);
        return {
          depend() {
            dep;
          },
          notify() {
            dep += 1;
          },
        };
      },
      isInScope: () => !!$effect.tracking(),
    },
  });

  let items = $state.raw([]);
  $effect(() => {
    const cursor = Posts.find({});
    items = cursor.fetch();

    return () => {
      cursor.cleanup();
    };
  });
</script>
```

This code sets up a `Posts` collection and enables reactivity using Svelte’s built-in reactivity features.

## Creating a Svelte Component

Now let's create a component that lists posts and allows the user to add new ones. Here's an example:

```svelte
<script>
  import { Collection } from "@signaldb/core";

  const Posts = new Collection({
    reactivity: {
      create() {
        let dep = $state(0);
        return {
          depend() {
            dep;
          },
          notify() {
            dep += 1;
          },
        };
      },
      isInScope: () => !!$effect.tracking(),
    },
  });

  let items = $state.raw([]);
  $effect(() => {
    const cursor = Posts.find({});
    items = cursor.fetch();

    return () => {
      cursor.cleanup();
    };
  });
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
1. **Reactivity Configuration**: We define the reactivity system inside the `Posts` collection, with `depend()` and `notify()` managing dependencies.
2. **Reactive Items List**: The `items` array is set using Svelte's reactivity system, and the component automatically updates when the `Posts` collection changes.
3. **UI Interaction**: Clicking the "Add Post" button inserts a new post into the `Posts` collection, which triggers the component to update.

## Conclusion

You’ve now learned how to set up SignalDB in a Svelte project and create a reactive component to display and add posts. By leveraging Svelte’s reactivity, you can efficiently manage data and create dynamic user interfaces with SignalDB.

## Next Steps

Now that you’ve learned how to use SignalDB in Svelte, you maybe want to explore the possibilities how you can synchronize the data with your backend.
Take a look at the [Synchronization Overview](/sync/) to get started
