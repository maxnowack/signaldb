---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/guides/angular/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/guides/angular/
- - meta
  - name: og:title
    content: Use SignalDB in Angular
- - meta
  - name: og:description
    content: Learn how to integrate SignalDB into your Angular application. This guide covers the initial setup and building a component with real-time updates.
- - meta
  - name: description
    content: Learn how to integrate SignalDB into your Angular application. This guide covers the initial Setup and building a component with real-time updates.
- - meta
  - name: keywords
    content: SignalDB, Angular, integration guide, reactivity, real-time updates, JavaScript, TypeScript, Angular reactivity, SignalDB plugin, collection setup, reactive components
---
# Use SignalDB in Angular

This guide will show you how to incorporate SignalDB into your Angular app, including setting up collections and using SignalDB’s reactive features within Angular components.

## Requirements

Before we begin, ensure you have a basic understanding of Angular and an existing Angular project ready. If not, refer to the [Angular Tutorial](https://angular.dev/tutorials/first-app).

It’s also helpful to be familiar with signal-based reactivity. You can learn more about this in the [Core Concepts](/core-concepts/#signals-and-reactivity) section and explore [Angular Signals](https://angular.dev/guide/signals) to see how reactivity is handled in the framework.

## Installing SignalDB

To begin, install SignalDB by running this command in your terminal:

```bash
npm install @signaldb/core
```

Next, install the Angular-specific reactivity adapter for SignalDB:

```bash
npm install @signaldb/angular
```

## Setting Up SignalDB

With SignalDB installed, you’ll now set up a collection and configure the reactivity adapter for Angular:

```js
import { Collection } from '@signaldb/core';
import angularReactivityAdapter from '@signaldb/angular';

const Posts = new Collection<{ id: string, title: string, author: string }>({
  reactivity: angularReactivityAdapter,
});
```

In this example, we define a `Posts` collection and use the Angular reactivity adapter to enable seamless updates in your Angular components.

## Building an Angular Component

Let’s now create an Angular component that uses SignalDB to display and manage a list of posts:

```typescript
import { Component, effect } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Collection } from '@signaldb/core';
import angularReactivityAdapter from '@signaldb/angular';

const Posts = new Collection<{ id: string, title: string, author: string }>({
  reactivity: angularReactivityAdapter,
});

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet],
  template: `
    <ul>
      <li><button (click)="insertPost()">Add Post</button></li>
      @for (item of items; track item.title) {
        <li>{{item.title}} ({{item.author}})</li>
      }
    </ul>
  `,
})
export class AppComponent {
  items: {id: string, title: string, author: string}[] = [];

  insertPost() {
    Posts.insert({ title: 'Post 1', author: 'Author 1' });
  }

  constructor() {
    effect((onCleanup) => {
      const cursor = Posts.find();
      this.items = cursor.fetch();
      onCleanup(() => {
        cursor.cleanup();
      });
    });
  }
}
```

### Key Concepts:
1. **Collection Setup**: We create a `Posts` collection with `@signaldb/angular` to enable reactivity.
2. **Component Overview**: The `AppComponent` uses Angular’s `effect()` to automatically update the `items` array whenever the `Posts` collection changes.
3. **Rendering in Template**: The template renders a list of posts using an `@for` loop, and the `insertPost()` method adds a new post when the "Add Post" button is clicked.
4. **Effect Hook**: The `effect()` function handles reactivity, ensuring the component stays in sync with changes in the `Posts` collection. The cleanup function removes the cursor when the component is destroyed.

## Wrapping Up

You have now successfully integrated SignalDB into an Angular app and created a reactive component to display and manage posts. With this setup, you can leverage SignalDB’s reactive capabilities to handle data updates and synchronization in your Angular application.

## Next Steps

Now that you’ve learned how to use SignalDB in Angular, you maybe want to explore the possibilities how you can synchronize the data with your backend.
Take a look at the [Synchronization Overview](/sync/) to get started
