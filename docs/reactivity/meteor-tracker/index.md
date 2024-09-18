---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/meteor-tracker/
- - meta
  - name: og:type
    content: article
- - meta
  - name: og:url
    content: https://signaldb.js.org/reactivity/meteor-tracker/
- - meta
  - name: og:title
    content: SignalDB Reactivity Adapter for Meteor Tracker
- - meta
  - name: og:description
    content: Discover how to integrate Meteor Tracker with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: description
    content: Discover how to integrate Meteor Tracker with SignalDB using the reactivity adapter for seamless reactive database integration.
- - meta
  - name: keywords
    content: SignalDB, Meteor Tracker, reactivity adapter, integration guide, dependency tracking, automatic updates, JavaScript, npm package, Tracker.autorun, reactivity, Meteor framework
---
# Reactivity adapter for [Meteor Tracker](https://docs.meteor.com/api/tracker.html)

Meteor Tracker is an integral component of the Meteor framework, offering a seamless dependency tracking system that ensures automatic updates of templates and computations when underlying data sources, such as Session variables or database queries, undergo changes. This dynamic integration is further enhanced when paired with SignalDB. With its signal-based reactivity, SignalDB effortlessly synchronizes with Meteor Tracker's automatic dependency management. Users don't need to manually declare these dependencies; the synergy between Meteor Tracker and SignalDB ensures that it "just works." When a reactive function, like a database query, is invoked, Meteor Tracker intuitively saves the current Computation object. Subsequent changes to the data trigger an "invalidate" action on the Computation, prompting it to rerun and, in turn, rerender the associated template. While applications can leverage the Tracker.autorun feature for routine tasks, advanced functionalities like Tracker.Dependency and onInvalidate callbacks are tailored for package authors aiming to implement new reactive data sources. This seamless integration underscores the power and efficiency of combining Meteor Tracker's automatic dependency tracking with SignalDB's reactive capabilities.

## Adapter

* ✅ Automatic Cleanup
* ✅ Scope check

## Installation

```bash
  $ npm install signaldb-plugin-meteor
```

## Usage

```js
import { Collection } from 'signaldb'
import reactivityAdapter from 'signaldb-plugin-meteor'

const posts = new Collection({
  reactivity: reactivityAdapter(Tracker),
})

Tracker.autorun(() => {
  console.log(posts.find({ author: 'John' }).count())
})
```
