import { describe, it, expect, vi, beforeEach } from 'vitest'
import AsyncDataAdapter from '../src/AsyncDataAdapter'
import Collection from '../src/Collection'
import type { CollectionBackend } from '../src/DataAdapter'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem { id: string, rank?: number }

// A registered query is maintained on every write for as long as it is
// registered, so it has to stop being registered when its last observer goes.
// It did not: the unregister was gated on the disposing observer being the one
// that had registered, and a rerun that creates its replacement before the old
// one's cleanup runs — which the cleanup's own microtask deliberately allows —
// moves the count onto an observer that is not allowed to act on it.
//
// Measured in an app: thirteen `registerQuery` calls on one collection and not
// a single `unregisterQuery`, each re-registration answered with the whole
// 3,000-row result again.
describe('a query stops being registered when its last observer goes', () => {
  let collection: Collection<TestItem>
  let backend: CollectionBackend<TestItem, string>
  let registered: number
  let unregistered: number

  beforeEach(async () => {
    const storage = memoryStorageAdapter<TestItem>([{ id: 'a', rank: 1 }])
    collection = new Collection<TestItem>('items', new AsyncDataAdapter({ storage: () => storage }))
    backend = (collection as any).backend as CollectionBackend<TestItem, string>
    await backend.isReady()
    registered = 0
    unregistered = 0
    const realRegister = backend.registerQuery.bind(backend)
    const realUnregister = backend.unregisterQuery.bind(backend)
    vi.spyOn(backend, 'registerQuery').mockImplementation((selector, options) => {
      registered += 1
      return realRegister(selector, options)
    })
    vi.spyOn(backend, 'unregisterQuery').mockImplementation((selector, options) => {
      unregistered += 1
      return realUnregister(selector, options)
    })
  })

  // Observing through a cursor is what registers; disposing the observation is
  // what should take it away.
  const observe = () => {
    const cursor = collection.find({})
    return cursor.observeChanges({ added: () => {} })
  }
  // The cleanup runs in a microtask, and the unregister it decides on is a
  // second hop behind that.
  const settleCleanup = () => new Promise<void>((resolve) => {
    queueMicrotask(() => {
      queueMicrotask(resolve)
    })
  })

  it('unregisters when the only observer is disposed', async () => {
    const stop = observe()
    expect(registered).toBe(1)
    stop()
    await settleCleanup()
    expect(unregistered).toBe(1)
  })

  it('unregisters when a replacement observer outlives the one that registered', async () => {
    // The shape a reactive rerun produces: the new observation is created
    // before the old one's cleanup microtask runs.
    const first = observe()
    const second = observe()
    expect(registered).toBe(1)

    first()
    await settleCleanup()
    // Still watched, so nothing is given up.
    expect(unregistered).toBe(0)

    second()
    await settleCleanup()
    // And now nobody is watching. This is the case that used to leak.
    expect(unregistered).toBe(1)
  })

  it('does not register the same query twice while it is still watched', async () => {
    const first = observe()
    const second = observe()
    expect(registered).toBe(1)
    first()
    await settleCleanup()
    second()
    await settleCleanup()
    // Registered once, given up once — the pair a session's log should show.
    expect(registered).toBe(1)
    expect(unregistered).toBe(1)
  })
})
