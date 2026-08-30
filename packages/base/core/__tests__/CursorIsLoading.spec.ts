import { describe, it, expect, vi } from 'vitest'
import { Collection, createReactivityAdapter } from '../src'
import AsyncDataAdapter from '../src/AsyncDataAdapter'
import type StorageAdapter from '../src/types/StorageAdapter'
import memoryStorageAdapter from './helpers/memoryStorageAdapter'

interface TestItem {
  id: string,
  name: string,
}

// The smallest reactivity that still distinguishes "the scope re-ran" from
// "the value changed" — same shape as the one in reactivity.spec.ts.
const reactivity = (() => {
  class Computation {
    onInvalidateCallbacks: (() => void)[] = []

    constructor(public effectCallback: () => void) {}

    onInvalidate(callback: () => void) {
      this.onInvalidateCallbacks.push(callback)
    }

    invalidate() {
      this.onInvalidateCallbacks.forEach(callback => callback())
    }
  }

  let currentComputation: Computation | null = null

  const signal = () => {
    let version = 0
    const dependents = new Set<Computation>()
    return {
      depend: () => {
        if (currentComputation) dependents.add(currentComputation)
        return version
      },
      notify: () => {
        version += 1
        ;[...dependents].forEach((computation) => {
          computation.effectCallback()
        })
      },
    }
  }

  const effect = (callback: () => void) => {
    let last: Computation | null = null
    const effectCallback = () => {
      if (last) last.invalidate()
      const computation = new Computation(effectCallback)
      last = computation
      currentComputation = computation
      try {
        callback()
      } finally {
        currentComputation = null
      }
    }
    effectCallback()
    return () => {
      if (last) last.invalidate()
    }
  }

  return { signal, effect, getCurrentComputation: () => currentComputation }
})()

const reactivityAdapter = createReactivityAdapter({
  create: () => reactivity.signal(),
  onDispose: (dispose) => {
    reactivity.getCurrentComputation()?.onInvalidate(dispose)
  },
  isInScope: () => !!reactivity.getCurrentComputation(),
})

const createCollection = (
  storage: StorageAdapter<any, any>,
  name = 'items',
) => new Collection<TestItem>(
  name,
  new AsyncDataAdapter({ storage: () => storage, onError: () => {} }),
  { reactivity: reactivityAdapter },
)

const tick = (ms = 40) => new Promise<void>((resolve) => {
  setTimeout(resolve, ms)
})

/**
 * Reads a reactive value once, inside a scope, without leaving an effect behind.
 * @param read - The reactive read to perform.
 * @returns The value from the first (and only) run.
 */
const readOnce = <T>(read: () => T): T => {
  const values: T[] = []
  const stop = reactivity.effect(() => {
    values.push(read())
  })
  stop()
  return values[0]
}

describe('Cursor#isLoading', () => {
  it('is true until the query delivers its first result', async () => {
    const collection = createCollection(
      memoryStorageAdapter<TestItem, string>([{ id: 'a', name: 'first' }], 20),
    )
    const seen: boolean[] = []

    reactivity.effect(() => {
      seen.push(collection.find({}).isLoading())
    })

    expect(seen).toEqual([true])
    await tick()
    expect(seen).toEqual([true, false])
    expect(readOnce(() => collection.find({}).fetch())).toHaveLength(1)
  })

  // The regression this whole API exists for: an empty result produces no diff,
  // so the result-set observer never notifies. Without a notifier of its own,
  // a consumer gated on `isLoading()` would wait forever on exactly the empty
  // collections it is meant to explain.
  it('settles for a query that completes with no items at all', async () => {
    const collection = createCollection(memoryStorageAdapter<TestItem, string>([], 20))
    const seen: boolean[] = []

    reactivity.effect(() => {
      seen.push(collection.find({}).isLoading())
    })

    expect(seen).toEqual([true])
    await tick()
    expect(seen).toEqual([true, false])
  })

  it('is false for a data adapter that answers synchronously', () => {
    const collection = new Collection<TestItem>({ reactivity: reactivityAdapter })
    expect(readOnce(() => collection.find({}).isLoading())).toBe(false)
  })

  it('is false for an async cursor, whose fetch awaits the real result', async () => {
    const collection = createCollection(memoryStorageAdapter<TestItem, string>([], 20))
    expect(collection.find({}, { async: true }).isLoading()).toBe(false)
    await tick()
  })

  // "No result yet", not "an execution is in flight": a write drives an
  // already-settled query back through `'active'`, and a list must not fall
  // back to a loading state every time one of its rows changes. The second
  // expectation keeps this honest — it pins that the refresh window really is
  // open at that moment, so the first one cannot pass by simply missing it.
  it('stays settled while a write re-runs the query', async () => {
    const storage = memoryStorageAdapter<TestItem, string>([{ id: 'a', name: 'first' }], 20)
    const collection = createCollection(storage)
    const seen: boolean[] = []

    reactivity.effect(() => {
      seen.push(collection.find({}).isLoading())
    })
    await tick()
    expect(seen).toEqual([true, false])

    void collection.insert({ id: 'b', name: 'second' })
    await tick(5)

    expect(readOnce(() => collection.find({}).isLoading())).toBe(false)
    expect(readOnce(() => collection.find({ name: 'never asked before' }).isLoading())).toBe(true)

    await tick()
    expect(seen.slice(1).every(value => value === false)).toBe(true)
  })

  it('is false once a permanently failing query has given up', async () => {
    const failing: StorageAdapter<TestItem, string> = {
      setup: () => Promise.resolve(),
      teardown: () => Promise.resolve(),
      createIndex: () => Promise.resolve(),
      dropIndex: () => Promise.resolve(),
      readIndex: () => Promise.resolve(new Map()),
      readAll: () => Promise.reject(new Error('storage exploded')),
      readIds: () => Promise.resolve([]),
      insert: () => Promise.resolve(),
      replace: () => Promise.resolve(),
      remove: () => Promise.resolve(),
      removeAll: () => Promise.resolve(),
    }
    const collection = new Collection<TestItem>(
      'failing',
      new AsyncDataAdapter({
        storage: () => failing,
        onError: () => {},
        retry: { attempts: 2, delay: () => 0 },
      }),
      { reactivity: reactivityAdapter },
    )
    const seen: boolean[] = []

    reactivity.effect(() => {
      seen.push(collection.find({}).isLoading())
    })

    expect(seen).toEqual([true])
    await tick()
    expect(seen.at(-1)).toBe(false)
  })

  it('is pending again after the query was unregistered and asked for anew', async () => {
    const collection = createCollection(
      memoryStorageAdapter<TestItem, string>([{ id: 'a', name: 'first' }], 20),
    )

    const stop = collection.find({}).observeChanges({ addedBefore: vi.fn() })
    await tick()
    expect(readOnce(() => collection.find({}).isLoading())).toBe(false)

    stop()
    // The collection unregisters in a microtask, so quick re-registrations can
    // be batched away; this waits past that point on purpose.
    await tick()

    expect(readOnce(() => collection.find({}).isLoading())).toBe(true)
  })
})
