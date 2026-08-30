# Monorepo layout

The repository is an npm workspace monorepo (`CONTRIBUTING.md`): the packages
live under `packages/`, the documentation website under `docs/`, runnable
examples under `examples/`.

- `packages/base/core` — `@signaldb/core`: `Collection`, `Cursor`, `Observer`,
  the `DataAdapter` implementations (`DefaultDataAdapter`, `AsyncDataAdapter`,
  `WorkerDataAdapter`/`WorkerDataAdapterHost`, `AutoFetchDataAdapter`),
  selectors, modifiers, indices.
- `packages/base/sync` — `@signaldb/sync`.
- `packages/integrations/*` — framework integrations (`react`).
- `packages/reactivity-adapters/*` — one thin adapter per reactivity library.
- `packages/storage-adapters/*` — one adapter per storage backend, plus the
  shared suites in `packages/storage-adapters/__tests__`.
- `packages/devtools/*` — `@signaldb/devtools`.

Install and run everything from the repository root — `npm install`,
`npm run lint`, `npm run type-check`, `npm test`, `npm run build`,
`npm run bench`, `npm run coverage`. Never `npm install` inside a package;
scope a task with `-w packages/…` when it really concerns one package.

**(MUST)** The repository root holds only the files that already live there.
`README.md` and `CHANGELOG.md` are **symlinks** into `packages/base/core/` —
edit the target, never the link, and never add a new top-level document; a new
document belongs in `docs/` or next to the package it describes.

# Documentation and changelog ownership

Documentation language is English, including code, comments, commit messages
and everything under `docs/`.

| Document | Owns | Update when |
| --- | --- | --- |
| `packages/base/core/README.md` (= root `README.md`) | What SignalDB is, the pitch, the entry point | The pitch or the package set changes |
| `CONTRIBUTING.md` | How to set up, test, cover, document and commit a change | The workflow or the tooling changes |
| `packages/*/*/CHANGELOG.md` | The user-visible history of exactly one package | Anything a consumer of that package could notice changes |
| `docs/<section>/` | The narrative documentation (concepts, guides, how-tos) | The way a feature is meant to be used changes |
| `docs/reference/<package>/<symbol>/` | The API surface of one exported symbol | A signature, option, event, or its semantics changes |
| JSDoc on the exported symbol | The generated API reference (`npm run typedoc`) | The symbol changes |
| `AGENTS.md` | Working rules for this repository, including this map | Process or documentation structure changes |

- **(MUST)** Every change a consumer could notice gets an entry in the
  `[Unreleased]` section of the changed package's own `CHANGELOG.md`, under the
  Keep a Changelog headings (`BREAKING CHANGES`, `Added`, `Changed`, `Fixed`,
  `Removed`). One changelog per package — a change to `@signaldb/react` is
  never recorded in core's changelog.
- **(MUST)** Write the entry for the person upgrading: what changed, and what
  they now have to do or can now rely on. "Refactored the query path" is not an
  entry; "a write now costs the size of the change rather than the size of the
  result" is.
- **(MUST NOT)** Reshape the nine header lines of a `CHANGELOG.md`. Every
  `docs/changelog/<package>/index.md` includes the file from line 10 onwards,
  so inserting or removing a line above that point silently cuts off or
  duplicates a heading on the published changelog page.
- **(MUST)** When the API changes, the documentation changes in the same change
  set: the JSDoc, the reference page, and any narrative page that shows the old
  usage. A new docs page carries the frontmatter block its neighbours have
  (canonical link, `og:*`, description, keywords) and is registered in the
  sidebar in `docs/.vitepress/config.mts` — an unregistered page is invisible.
- **(MUST)** Mark reactive methods in their JSDoc with the established line
  `⚡️ this function is reactive!`. Whether a method registers a dependency is
  the first thing a reader needs to know about it.
- **(MUST NOT)** Hand-edit generated artifacts: `dist/` output,
  `docs/typedoc.json`, `docs/public/examples`, `package-lock.json`, or the
  `version` fields in the `package.json` files.

# Before coding

- **(MUST)** Read the information provided by the user carefully and ask
  questions before you start investigating the code, to ensure you understand
  the problem and the desired outcome. Do this for every new prompt, even if
  you already asked questions earlier in the conversation. Do not assume the
  user has given you everything in a single prompt.
- **(MUST)** Ask clarifying questions whenever something is ambiguous, missing
  or unclear. Do not make assumptions about intent or the desired outcome.
- **(MUST)** When a prompt states a new rule — or anything interpretable as a
  durable rule (a preference, convention, or process meant to outlast the
  current task) — ask the user whether it should be added to `AGENTS.md`. If
  the user confirms, write it into the appropriate section, phrased as a
  general rule, in the same change set.
- **(SHOULD)** Draft and confirm an approach for complex work, and list clear
  pros and cons when two or more approaches exist.
- **(MUST)** When debugging a bug or regression, identify the plausible
  explanations for the reported behavior before proposing or implementing a
  fix, actively challenge your own hypotheses, and rule out the main
  alternatives before committing to an explanation.
- **(MUST)** When the user corrects your bug analysis, record the correction
  precisely and update your working assumptions immediately.
- **(MUST)** Prefer fixes that address the underlying cause rather than changes
  that only hide, suppress, or bypass the visible symptom. Do not disable,
  remove or degrade intended behavior merely to make a bug disappear.
- **(MUST)** Do not optimize for an immediate patch before you have high
  confidence in the actual explanation. First converge on the real cause, then
  implement the fix that directly addresses it.
- **(MUST)** Start the investigation in the isolated part of the library where
  the defect occurs and expand the scope only as needed. Before expanding it,
  ask the user to confirm that your analysis matches their observation.
- **(MUST)** A bug reported from a consuming application is reproduced *here*,
  as a failing test, before it is fixed. A fix verified only in the application
  that reported it is not verified: the next release has no way to know about
  it. The report is a lead; the failing spec is the evidence.
- **(MUST)** Before drawing a conclusion from a measurement, confirm *which
  build produced it*. A package resolves to `dist/` in some contexts and to
  `src/` through the `paths` mapping in others, `npm run build` output can be
  stale, and `npm ci` silently removes an `npm link`. Check what is actually
  loaded, not the lockfile and not your memory of what you installed.

# While coding

`npm run lint` is the authority on style; this section states the intent
behind what `eslint.config.mjs` enforces.

- **(MUST)** Omit semicolons, use single quotes, indent with 2 spaces, keep
  lines within 100 characters.
- **(MUST)** Use `import type { … }` for type-only imports.
- **(MUST)** Every function carries a JSDoc block (`jsdoc/require-jsdoc` is an
  error) documenting its parameters and its return value — these blocks *are*
  the generated API reference, not decoration.
- **(MUST)** Use PascalCase for classes and types, camelCase for variables,
  functions and instances; file names are camelCase or PascalCase and match
  their default export (`src/utils/deepClone.ts` default exports `deepClone`).
- **(MUST)** Spell names out — `unicorn/prevent-abbreviations` is on, and the
  allow-list is deliberately short.
- **(MUST)** No non-null assertions, no import cycles, no use of deprecated
  API. `@typescript-eslint/no-deprecated` is an error, so deprecating something
  includes migrating every internal caller in the same change set.
- **(SHOULD)** Use default exports for modules, and arrow functions for
  components.
- **(SHOULD)** Prefer simple, composable, testable functions over classes. The
  existing classes (`Collection`, `Cursor`, `Observer`) are the exception, not
  the pattern to follow.
- **(SHOULD)** Default to `type`; use `interface` only when it is more readable
  or interface merging is required.
- **(SHOULD)** Keep the code strictly typed and avoid `any`, even where the
  lint rules tolerate it.
- **(SHOULD NOT)** Add comments except for critical caveats; rely on
  self-explanatory code. Do not remove existing comments unless they are
  clearly outdated or incorrect.
- **(SHOULD NOT)** Extract a new function unless it will be reused elsewhere,
  is the only way to unit-test otherwise untestable logic, or drastically
  improves readability of an opaque block.
- **(MUST)** Do not add speculative or unnecessary code. First identify the
  root cause, then implement only what addresses it.
- **(MUST NOT)** Ship a quick workaround that changes or bypasses intended
  semantics to hide a symptom. If an emergency mitigation is explicitly
  requested, label it as temporary, state the root-cause fix that remains, and
  do not present it as complete work.

# The API contract

- **(MUST)** Treat every export as a contract. Consumers upgrade on their own
  schedule and cannot see the reasoning behind a change — only its effect.
  Develop in a backwards-compatible way; when a breaking change is unavoidable,
  it is deliberate, recorded under `BREAKING CHANGES` with the migration a
  consumer has to perform, and never folded into a `fix:` commit.
- **(MUST)** Semantics are part of the contract, not just types. *When* a
  result is published, *when* `isLoading` flips, whether a method is
  synchronous, which observer events fire and how many of them, what counts as
  a dependency under `fieldTracking` — a change to any of these breaks
  consumers while TypeScript stays silent, which makes it more dangerous than a
  signature change, not less.
- **(MUST)** A reactive query that has not been answered yet publishes a
  *neutral* result — an empty list, a zero count — and that result is
  indistinguishable from a real one, because empty is a legitimate answer.
  `Cursor#isLoading()` is the only thing that lets a consumer tell the two
  apart. Anything that changes when the neutral value is published, or that
  makes `isLoading()` less trustworthy, is a correctness bug even if every test
  still passes.
- **(MUST)** A `DataAdapter` is an extension point with a written contract
  (`packages/base/core/src/DataAdapter.ts`). Adding a required member to
  `CollectionBackend` breaks every custom adapter in existence: extend it
  optionally, keep the fallback path that adapters without the new member take,
  and say in the changelog what an adapter gains by implementing it. The same
  applies to `StorageAdapter` and `ReactivityAdapter`.
- **(MUST)** Uphold the delta contract in both directions: a delta is only ever
  passed when it is relative to the last result `getQueryResult` returned, and
  an adapter that layers anything on top of its stored result — an optimistic
  write still in flight — omits it. A wrong delta is worse than no delta: it
  desynchronises a consumer silently and permanently.
- **(MUST)** A reactivity adapter's dependencies are cleaned up through
  `onDispose`, and code that reads reactively respects `isInScope()`. Missing
  either turns a dependency into a leak that outlives the component that
  created it.
- **(SHOULD)** Add to the public surface reluctantly. Every exported name is
  documentation, a reference page, bundle size and a future migration. Prefer
  making an existing concept do the job over introducing a new one.
- **(MUST)** New public API is exported from the package's `src/index.ts`,
  documented under `docs/reference/<package>/`, and covered by tests before it
  counts as done.

# Cost is part of the behavior

SignalDB's job is to keep an application responsive, so the cost of an
operation is part of its behavior, not an implementation detail.

- **(MUST)** The cost of a write scales with the size of the *change*, not with
  the size of the data or of the results on screen. The write path propagates a
  description of what changed; do not regress into re-running affected queries
  and diffing their results.
- **(MUST)** Nothing on a hot path scales with the total number of items unless
  the operation is genuinely about all of them. A query that can be answered
  from its window stays answered from its window; a lookup that has an index
  uses it; a question whose answer is already known is not asked again.
- **(MUST)** The worker boundary is a serialization boundary. Everything
  crossing `WorkerDataAdapter` ↔ `WorkerDataAdapterHost` is serialized and
  deserialized on the consumer's main thread, so a message's *size* is a
  main-thread cost even though the work behind it is not. Send deltas rather
  than results, project rather than sending whole items.
- **(MUST)** Keep global effects scoped. `Collection.batch()` without arguments
  batches *every* collection in the process and defers every live query
  everywhere until it ends — right for a handful of writes belonging to one
  event, harmful around anything whose length is data-dependent. Library code
  never opens an unbounded batch, and any new mechanism with process-wide reach
  offers a scoped form from the start.
- **(MUST)** A performance claim is backed by a measurement. Benchmarks live in
  `packages/*/*/__tests__/*.bench.ts` and run with `npm run bench`; a
  performance-motivated change adds or updates one and states the numbers in
  the changelog entry when a consumer would care.
- **(SHOULD)** When a cost is unavoidable but invisible, make it observable
  rather than silent. `Collection.reportLargeQueries()` exists because a live
  query registered from a long-lived place works perfectly and only shows up
  much later as an application that has grown slow.

# Package boundaries and packaging

- **(MUST)** `@signaldb/core` knows nothing about any framework, any storage
  backend, or any host environment. Reactivity enters through
  `createReactivityAdapter`, storage through `createStorageAdapter`, data
  operations through `DataAdapter` — extend an existing seam rather than
  teaching core about a specific consumer.
- **(MUST)** A reactivity adapter is thin: it maps one framework's primitives
  onto `create`/`depend`/`notify`/`onDispose`/`isInScope` and holds no query
  logic. A storage adapter persists and loads and holds no reactive logic.
  Logic that would otherwise be repeated in more than one adapter belongs in
  core.
- **(MUST)** Core runs in browsers, web workers, Node.js (20/22/24 in CI) and
  in React Native's Hermes. Do not reach for a DOM or Node-only global in core,
  and check runtime support before using a recent language or standard-library
  feature — a single unsupported array method once made the whole adapter
  unusable on Hermes.
- **(MUST)** Every sibling `@signaldb/*` package a package imports is listed in
  `rollupOptions.external` in that package's `vite.config.mts`. A missing entry
  bundles a second copy of core into the adapter's `dist`, which a consumer
  pays for in bundle size and in two `Collection` implementations that do not
  share state.
- **(MUST)** A new runtime dependency needs an explicit justification: bundle
  size is measured on every build (`npm run analyze-bundle`) and every
  dependency is inherited by every consuming application. Core depends on
  `fast-sort` and `mingo` — that is the bar.
- **(MUST)** A new package is wired up everywhere before it counts as done:
  `package.json` (`exports`, `main`, `module`, `types`, `typesVersions`,
  `files`, `sideEffects`), its own `tsconfig.json`, `vite.config.mts`,
  `vitest.config.mts`, `typedoc.json`, `README.md` and `CHANGELOG.md`; the
  `paths` entry in the root `tsconfig.json`; and in `docs` both the sidebar
  entry and a `docs/changelog/<package>/index.md` include page. Copy the
  closest existing sibling rather than assembling this from memory.
- **(MUST NOT)** Introduce an import cycle between modules; the lint rule
  catches it, and a cycle across packages means a boundary is in the wrong
  place.
- **(SHOULD)** Keep `examples/` working. It compiles against the workspace
  packages and is built as part of `npm run docs:build`, so an API change that
  makes an example stale breaks the documentation build.

# Diagnostics

- **(MUST)** A `console` call in library code is a message to the consumer, not
  a debugging aid — that is why each one carries an explicit
  `eslint-disable no-console`. It states what is wrong and what to do about it
  (`Cursor.depend()` and `reportLargeQueries` are the models), and it fires
  once per distinct problem, never per write or per render.
- **(MUST NOT)** Put consumer data into a log. Log a selector's *keys*, never
  its values; the shape identifies the problem, the values are the user's data
  and may end up in a crash reporter.
- **(SHOULD)** Reserve `console.error` for a failure the consumer cannot catch
  themselves, and give any error crossing an async or worker boundary somewhere
  to go — an error that is only thrown into a detached promise is invisible.

# Testing

- **(MUST)** SignalDB aims for 100% line coverage and the vitest config
  enforces it. A new feature ships with tests; `npm run coverage` is how you
  check, not CI.
- **(MUST)** An `istanbul ignore` needs a written reason in the code and in the
  pull request. It is for genuinely untestable edge cases, never for a case
  that is merely awkward to reach.
- **(MUST)** Unit tests live beside their subject as `*.spec.ts`; suites that
  cover several packages live in `__tests__/`. Behavior shared by several
  adapters is tested once, in the shared suite, not copied per adapter.
- **(MUST)** Run `npm run build` before `npm run type-check` or the test suite
  when a package that others consume has changed — the workspace resolves built
  output in those places, which is what CI does.
- **(MUST)** `retry: 3` in the vitest config absorbs CI noise; it does not make
  a race pass. A test that only succeeds on a retry is a defect in the test or
  in the code, and is fixed rather than accepted.
- **(SHOULD)** Write the test that fails for the reason you think it should
  fail. Confirm it fails before the fix and passes after it — a test that was
  green all along has verified nothing.
- **(SHOULD)** Test through the public API. A spec that reaches into internals
  passes through a refactor that broke the consumer, and fails on a refactor
  that changed nothing for them.
- **(MUST)** `npm run lint`, `npm run type-check` and `npm test -- run` are
  clean before work counts as done.

# Commits and releasing

- **(MUST)** Write semantic commit messages in the Conventional Commits format
  (`commitlint` enforces it): `type(scope): subject`, e.g.
  `fix(core): keep a query's state when its delta says nothing changed`. The
  scope is the package's short name (`core`, `sync`, `react`, `devtools`,
  `indexeddb`, …), omitted for changes spanning the repository. The subject is
  English, imperative, lower-case after the colon, without a trailing period,
  and stays within roughly 72 characters; detail and rationale belong in the
  body.
- **(MUST)** Stage explicitly, by path. Never `git add -A`, `git add .`, or
  `git commit -a` — other sessions and the user's own editor write to the same
  working tree. Read `git status` before committing, confirm every staged path
  is your own work, and verify afterwards with `git show --stat`.
- **(MUST)** Do not work in branches unless the user asks for it.
- **(MUST NOT)** Bump versions, publish, or tag. Version bumps and releases are
  the maintainer's step; your work ends at the `[Unreleased]` changelog entry.
- **(SHOULD)** Keep a change set to one concern. A perf change, a fix and a
  refactor in one commit cannot be reverted, bisected or reviewed separately.

# Additional instructions

- **(MUST)** Answer the user in the language they wrote in, and keep following
  them when they switch mid-conversation. This governs the conversation only —
  code, comments, commit messages and documentation stay English.
- When planning larger work, choose phase sizes big enough to be productive and
  small enough to stay focused. If a prompt contains multiple tasks, write a
  plan that gives each task a clear, testable Definition of Done, ask the user
  to confirm it before implementing, and check the result against every DoD
  before reporting completion.
- Report to the user as a management summary. Leave out technical detail they
  did not ask for, but never leave out something they need in order to
  understand the state of the work. If you are unsure which is which, ask.
