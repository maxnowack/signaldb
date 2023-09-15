---
head:
- - link
  - rel: canonical
    href: https://signaldb.js.org/reactivity/
---
# Reactivity

Check out the [core concepts about reactivity](/core-concepts/#signals-and-reactivity-adapters).

## Libraries

We provide prebuilt reactivity adapters for existing reactivity libraries. If an adapter is missing, feel free to request it by [opening an issue](https://github.com/maxnowack/signaldb/issues/new) at Github.

Some libraries don't have a cleanup method. That mean you have to call `<cursor>.cleanup()` manually after the reactive context was closed. Since this can lead to memory leaks, This is not very practical in a production environment. Adapters without the automatic cleanup should be considered as experimental.

Scope checking is also only supported by a few libraries. This means, that SignalDB is not able to check if a cursor was created from a reactive scope and applies the required event handlers used to provide the reactivity. To avoid memory leaks, use an adapter with scope checking or pass `reactive: false` to your options (e.g. `<collection>.find({ … }, { reactive: false })`)

| Library | Reactivity adapter | Automatic Cleanup | Scope check |
|---|---|---|---|
| [`@preact/signals-core`](/reactivity/preact-signals/) | ✅ | ❌ | ❌ |
| [`Solid Signals`](/reactivity/solidjs/) | ✅ | ✅ | ❌ |
| [`Maverick-js Signals`](/reactivity/maverickjs/) | ✅ | ✅ | ✅ |
| [`Meteor Tracker`](/reactivity/meteor-tracker/) | ✅ | ✅ | ✅ |
| [`oby`](/reactivity/oby/) | ✅ | ✅ | ✅ |
| [`usignal`](/reactivity/usignal/) | ✅ | ❌ | ❌ |
| [`sinuous`](/reactivity/sinuous/) | ✅ | ✅ | ❌ |
| [`@reactively/core`](/reactivity/reactively/) | ✅ | ✅ | ❌ |
| [`S.js`](/reactivity/S/) | ✅ | ✅ | ❌ |
| [`RxJS`](https://github.com/maxnowack/signaldb/issues/15) | ❌ | ❌ | ❌ | ❌ |
| [`MobX`](https://github.com/maxnowack/signaldb/issues/14) | ❌ | ❌ | ❌ | ❌ |
