---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/devtools/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/devtools/
- - meta
  - name: og:title
    content: Developer Tools | SignalDB
- - meta
  - name: og:description
    content: Learn how to use the developer tools in SignalDB to debug and inspect the state of your SignalDB instance at runtime.
- - meta
  - name: description
    content: Learn how to use the developer tools in SignalDB to debug and inspect the state of your SignalDB instance at runtime.
- - meta
  - name: keywords
    content: developer tools, SignalDB, debugging, inspecting, state, runtime, queries, mutations, performance
---

# Developer Tools

::: warning BETA
The developer tools are currently in beta and may not be fully functional or stable. Please report any issues you encounter by opening an issue on [GitHub](https://github.com/maxnowack/signaldb/issues/new).
:::

SignalDB provides a set of developer tools to help you debug and inspect the state of your SignalDB instance at runtime.

To get started, add the `@signaldb/devtools` package to your `devDependencies` of your project.

```bash
npm install --save-dev @signaldb/devtools
```

## Usage

The developer tools will load automatically when you start your development server. You should see the SignalDB icon in the bottom left corner of your screen.
You can open the developer tools by clicking on the icon or by pressing `Ctrl + Shift + S`.

::: info
In some environments, the automatic loading of the developer tools may not work. In this case, you can manually load the developer tools by calling `loadDeveloperTools()` somewhere in your code.

```ts
import { loadDeveloperTools } from '@signaldb/devtools';

loadDeveloperTools();
```
:::

The developer tools will open and you should the following tabs.

::: tip
The developer tools will try to resolve names for your collections. You can provide a name for your collection by passing the `name` property to the options of the collection constructor.
:::

### Data

The data tab shows the current state of all of your SignalDB collections. You can inspect the collections, documents and even edit the data directly in the developer tools.

### Queries

The queries tab shows all of the queries that have been executed on your SignalDB instance. Tracking all queries can decrease performance. You can deactivate tracking of queries by unticking the checkbox right next to the tab name.

### Mutations

The mutations tab shows all of the mutations that have been executed on your SignalDB instance. Tracking all mutations can decrease performance. You can deactivate tracking of mutations by unticking the checkbox right next to the tab name.

### Performance

The performance tab shows the time measurements of your queries of your SignalDB instance. You can see how long it took to execute queries. Tracking performance can decrease performance. You can deactivate tracking of performance by unticking the checkbox right next to the tab name.

### Settings

The settings tab allows you to configure the developer tools. You can change if the button should be shown (you can still open the developer tools with `Ctrl + Shift + S`) and what should be shown as a badge on the button. You can choose between collection count, query count or disable the badge.

::: tip
Also make sure to check out the examples listed in the sidebar. We've included the developer tools there as well.
:::
