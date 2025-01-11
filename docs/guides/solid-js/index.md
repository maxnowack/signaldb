---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/guides/solid-js/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/guides/solid-js/
- - meta
  - name: og:title
    content: Integrating SignalDB with Solid.js
- - meta
  - name: og:description
    content: Discover how to integrate SignalDB with Solid.js. This guide covers the initial setup and building Solid components with real-time updates.
- - meta
  - name: description
    content: Discover how to integrate SignalDB with Solid.js. This guide covers the initial setup and building Solid components with real-time updates.
- - meta
  - name: keywords
    content: SignalDB, Solid.js, integration guide, reactivity, real-time updates, JavaScript, TypeScript, Solid reactivity, SignalDB plugin, collection setup, reactive components
---
# Integrating SignalDB with Solid.js

This guide walks you through how to set up and use SignalDB within your Solid project. We’ll cover the initial setup steps and demonstrate how to incorporate SignalDB into your Solid components.

## Requirements

Before proceeding, make sure you’re familiar with the basics of Solid and have a Solid project ready. If you're new to Solid, check out the [SolidStart Getting Started](https://docs.solidjs.com/solid-start/getting-started) guide.

An understanding of signal-based reactivity will also be useful. If you're not familiar with this concept, refer to the [Core Concepts](/core-concepts/#signals-and-reactivity) section or the [Solid Documentation](https://docs.solidjs.com/concepts/signals) for an introduction.

## Installation

Begin by installing SignalDB. Run the following command in your terminal:

```bash
npm install @signaldb/core
```

Next, install the Solid reactivity adapter to integrate Solid signals with SignalDB:

```bash
npm install @signaldb/solid
```

## Setting Up

To integrate SignalDB into your Solid project, define your collections and configure the reactivity adapter. You can create this setup in a file for later use in your components.

```js
// Posts.js
import { Collection } from '@signaldb/core'
import solidReactivityAdapter from '@signaldb/solid'

const Posts = new Collection({
  reactivity: solidReactivityAdapter,
})

export default Posts
```

## Using SignalDB in Components

With the basic setup in place, you can now use SignalDB in your Solid components. Below is an example component that displays a list of posts:

```jsx
import { For } from "solid-js";
import Posts from './Posts'

const PostList = () => (
  <ul>
    <li>
      <button type="button" onClick={() => Posts.insert({ title: 'Test', author: 'Test' })}>
        Add
      </button>
    </li>

    <For each={Posts.find({}, { sort: { time: -1 } }).fetch()}>{post => (
      <li>
        {post.title} <span>({post.author})</span>
      </li>
    )}</For>
  </ul>
)
```

In this example, the `.find()` and `.fetch()` methods are used to retrieve data. The component automatically re-renders whenever the `Posts` collection is updated. Click the "Add" button to test the reactivity.

## Final Thoughts

You’ve now set up SignalDB in your Solid project and created a reactive component to display posts. With this, you can manage your data effectively and build reactive components in your Solid apps.

## Next Steps

Now that you’ve learned how to use SignalDB in Solid, you maybe want to explore the possibilities how you can synchronize the data with your backend.
Take a look at the [Synchronization Overview](/sync/) to get started
