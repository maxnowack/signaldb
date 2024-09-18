---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/guides/react/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/guides/react/
- - meta
  - name: og:title
    content: Use SignalDB with React - Integration Guide
- - meta
  - name: og:description
    content: Learn how to integrate SignalDB with your React project. This guide covers the installation process, basic setup, and creating reactive components using SignalDB and React hooks.
- - meta
  - name: description
    content: Learn how to integrate SignalDB with your React project. This guide covers the installation process, basic setup, and creating reactive components using SignalDB and React hooks.
- - meta
  - name: keywords
    content: SignalDB, React, integration guide, reactivity, real-time updates, JavaScript, TypeScript, SignalDB React bindings, Maverick Signals, reactive components, collection setup
---
# Use SignalDB with React

In this guide, you will learn how to use SignalDB together with React. We will cover the basic setup and how to use SignalDB in your React project.

## Prerequisites

Let's assume you already have basic knowledge of React and already have a React project set up. If you don't, you can follow the [official React documentation](https://react.dev/learn/start-a-new-react-project) to get started.

Also a basic understanding of signal-based reactivity is helpful. If you are not familiar with it, you can read about it on the [Core Concepts](/core-concepts/#signals-and-reactivity) page to get an overview.

## Installation

First of all, you need to install SignalDB. You can do this by running the following command in your terminal:

```bash
  npm install signaldb
```

We also need to install a signals library that provides the reactivity for SignalDB. We going to use [Maverick Signals](https://github.com/maverick-js/signals). The following command installs Maverick Signals and the corresponding reactivity adapter for SignalDB:

```bash
  npm install @maverick-js/signals
  npm install signaldb-plugin-maverickjs
```

Additionally we need to install the `signaldb-react` package that provides the React bindings for SignalDB:

```bash
  npm install signaldb-react
```

**You can also install all packages at once by running the following command:**

```bash
  npm install signaldb @maverick-js/signals signaldb-plugin-maverickjs signaldb-react
```

## Basic Setup

To use SignalDB in your React project, you need to set up your collections and the reactivity adapter. Do this in a file that you can import in your components.

```js
// Posts.js
import { Collection } from 'signaldb'
import maverickReactivityAdapter from 'signaldb-plugin-maverickjs'

const Posts = new Collection({
  reactivity: maverickReactivityAdapter,
})

export default Posts
```

In another file, you have to setup a react hook that provides the reactivity to your components. We have a helper function for that in the `signaldb-react` package, so that it is just a one liner for you:
```js
// useReactivity.js
import { createUseReactivityHook } from 'signaldb-react'
import { effect } from '@maverick-js/signals'

const useReactivity = createUseReactivityHook(effect)
export default useReactivity
```

The `useReactivity` function is a react hook that you can use in your components to make them reactive. It receives a function as the first argument that runs your reactive context. The function reruns whenever the data used inside changes. The return value of the function is the data that you want to use in your component. The `useReactivity` function also takes a dependency list as an optional second argument, similar to the [dependency list of the `useEffect` hook](https://react.dev/reference/react/useEffect#specifying-reactive-dependencies).

## Using SignalDB in your Components

Now you can use SignalDB in your components. Here is an example of a simple component that displays a list of posts:

```jsx
import React from 'react'
import useReactivity from './useReactivity'
import Posts from './Posts'

const PostList = () => {
  const posts = useReactivity(() => Posts.find({}).fetch())

  return (
    <ul>
      {posts.map(post => (
        <li key={post._id}>{post.title}</li>
      ))}
    </ul>
  )
}
```

In this example, we use the `useReactivity` hook to make the component reactive. The `useReactivity` hook runs the function that fetches the posts from the collection whenever the data changes. The `fetch` method returns an array of all documents in the collection.

## Conclusion

That's it! You have successfully set up SignalDB in your React project and created a reactive component that displays a list of posts. You can now use SignalDB in your React project to manage your data and make your components reactive.

## Next Steps

Now that you’ve learned how to use SignalDB in Angular, you maybe want to explore the possibilities how you can synchronize the data with your backend.
Take a look at the [Synchronization Overview](/sync/) to get started
