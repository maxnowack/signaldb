---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/guides/vue/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/guides/vue/
- - meta
  - name: og:title
    content: Using SignalDB with Vue
- - meta
  - name: og:description
    content: Learn how to integrate SignalDB into your Vue project. This guide covers the initial setup and using SignalDB with Vue’s reactivity system.
- - meta
  - name: description
    content: Learn how to integrate SignalDB into your Vue project. This guide covers the initial setup and using SignalDB with Vue’s reactivity system.
- - meta
  - name: keywords
    content: SignalDB, Vue, integration guide, reactivity, real-time updates, JavaScript, TypeScript, Vue reactivity, SignalDB plugin, collection setup, reactive components
---
# Using SignalDB with Vue

This guide will walk you through integrating SignalDB into a Vue project. You’ll learn how to set up collections and use SignalDB with Vue's reactivity system to manage and display data.

## Prerequisites

Before you start, make sure you have a basic understanding of Vue and have a Vue project ready. If you’re not familiar with Vue, you can follow the [Vue Getting Started](https://vuejs.org/guide/introduction.html) guide.

Familiarity with signal-based reactivity is also useful. For more information, you can review the [Core Concepts](/core-concepts/#signals-and-reactivity) page and the [Vue Documentation](https://vuejs.org/api/reactivity-core.html) to grasp how reactivity works.

## Installation

First, you need to add SignalDB to your project. Run the following command in your terminal:

```bash
npm install signaldb
```

Additionally, you will need the Vue-specific reactivity adapter for SignalDB:

```bash
npm install signaldb-plugin-vue
```

## Setting Up SignalDB

After installing SignalDB, set up your collections and configure the reactivity adapter for Vue. Here's an example of how to define a `Posts` collection:

```vue
<script setup lang="ts">
import { ref, watchEffect } from 'vue'
import { Collection } from 'signaldb'
import vueReactivityAdapter from 'signaldb-plugin-vue'

const Posts = new Collection({
  reactivity: vueReactivityAdapter,
})

const items = ref([])
watchEffect(() => {
  items.value = Posts.find().fetch()
})

function addPost() {
  Posts.insert({ title: 'Hello', author: 'World' })
}
</script>
```

In this code, we create a `Posts` collection using the Vue reactivity adapter. The `items` array is kept in sync with the collection using `watchEffect`.

## Building a Vue Component

Now, let’s build a Vue component that lists posts and allows you to add new ones:

```vue
<template>
  <div class="about">
    <button @click="addPost">
      Add Post
    </button>
    <ul>
      <li v-for="{ id, title, author } in items" :key="id">
        {{ title }} - {{ author }}
      </li>
    </ul>
  </div>
</template>
```

### Breakdown:
1. **Reactivity Setup**: The `Posts` collection is set up with `vueReactivityAdapter` to enable Vue's reactivity system.
2. **Reactive Data**: The `items` array is updated reactively using `watchEffect`, ensuring that changes in the `Posts` collection are reflected in the component.
3. **User Interaction**: The `addPost` function adds a new post to the `Posts` collection, and clicking the button triggers this function.
4. **Rendering**: The template uses Vue's `v-for` directive to display each post from the `items` array.

## Conclusion

You have successfully integrated SignalDB into a Vue project and created a reactive component to manage and display posts. This setup allows you to take advantage of SignalDB’s reactivity and Vue's capabilities to build dynamic and responsive applications.

## Next Steps

Now that you’ve learned how to use SignalDB in Angular, you maybe want to explore the possibilities how you can synchronize the data with your backend.
Take a look at the [Synchronization Overview](/sync/) to get started
