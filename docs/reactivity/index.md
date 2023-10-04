---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/
---
# Reactivity & Optimistic UI

Today, users demand near-instant feedback from their applications, expecting smooth and seamless interactions. Traditional asynchronous operations can sometimes slow down this experience. That's the reason why SignalDB uses reactivity and makes it easy to achieve an Optimistic UI.

## Understanding Optimistic UI

Optimistic UI is a design pattern where the application UI is updated immediately based on the expected result of an action, without waiting for a server's confirmation. It's all about improving the perceived performance of the application and delivering a more responsive user experience.

Key benefits of Optimistic UI are an improved User Experience (UX) and a general improved responsiveness of an application. 
Immediate feedback enhances user confidence in the application. The application feels more faster, since it will not wait for server confirmation and this means there's no noticeable lag for the user.

## SignalDB's Role in Promoting Optimistic UI

SignalDB's reactive architecture, combined with its memory storage, forms the backbone for implementing Optimistic UI. The database allows instant updates to the UI based on anticipated changes, which are then synchronized with actual data once it's processed.

### Signals and Reactivity

SignalDB harnesses signals, derived from functional reactive programming, to manage reactivity. The resurgence of signals, particularly after the popularity of solidjs in 2023, places SignalDB in a prime position.

1. **Integration with Signal Libraries**: SignalDB's design remains neutral to any particular signal library, offering integration through reactivity adapters. This compatibility ensures an up-to-date UI in tandem with data changes.
2. **Reactivity Adapters**: With these adapters, SignalDB can instantly query documents within a collection reactively. They seamlessly integrate with signal libraries, ensuring auto-updates to reactive queries when data changes.

By providing a smooth, responsive user experience, SignalDB ensures that user interactions remain at the forefront of modern web design and functionality.

### Data Persistence and Optimistic UI
While SignalDB stores data in memory, ensuring the persistence of this data across sessions or reloads is vital. With persistence adapters, this challenge is met head-on. They provide the mechanism to store data, whether it's in localStorage, IndexedDB, or a remote server. When coupled with Optimistic UI, persistence adapters ensure that even if there's a momentary lapse in data storage, the user's experience remains unaffected.



Also check out the [core concepts about reactivity](/core-concepts/#signals-and-reactivity).

## Reactivity Libraries

We provide prebuilt reactivity adapters for existing reactivity libraries. If an adapter is missing, feel free to request it by [opening an issue](https://github.com/maxnowack/signaldb/issues/new) at Github.

Some libraries don't have a cleanup method. That mean you have to call `<cursor>.cleanup()` manually after the reactive context was closed. Since this can lead to memory leaks, this is not very practical in a production environment. Adapters without the automatic cleanup should be considered as experimental.

Scope checking is also only supported by a few libraries. This means, that SignalDB is not able to check if a cursor was created from a reactive scope and applies the required event handlers used to provide the reactivity. To avoid memory leaks, use an adapter with scope checking or pass `reactive: false` to your options (e.g. `<collection>.find({ … }, { reactive: false })`)

| Library | Reactivity adapter | Automatic Cleanup | Scope check |
|---|---|---|---|
| [`@preact/signals-core`](/reactivity/preact-signals/) | ✅ | ❌ | ❌ |
| [`@reactively/core`](/reactivity/reactively/) | ✅ | ✅ | ❌ |
| [`Angular Signals`](/reactivity/angular/) | ✅ | ❌ | ❌ |
| [`Maverick-js Signals`](/reactivity/maverickjs/) | ✅ | ✅ | ✅ |
| [`Meteor Tracker`](/reactivity/meteor-tracker/) | ✅ | ✅ | ✅ |
| [`MobX`](/reactivity/mobx/) | ✅ | ✅ | ❌ |
| [`oby`](/reactivity/oby/) | ✅ | ✅ | ✅ |
| [`S.js`](/reactivity/S/) | ✅ | ✅ | ❌ |
| [`sinuous`](/reactivity/sinuous/) | ✅ | ✅ | ❌ |
| [`Solid Signals`](/reactivity/solidjs/) | ✅ | ✅ | ❌ |
| [`usignal`](/reactivity/usignal/) | ✅ | ❌ | ❌ |
