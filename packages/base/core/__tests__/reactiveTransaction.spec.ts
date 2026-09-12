import { vi, describe, it, expect, beforeEach } from 'vitest'
import { Collection, reactiveTransaction, isInReactiveTransaction } from '../src'
import { resetReactiveTransactions } from '../src/reactiveTransaction'
import { primitiveReactivity, primitiveReactivityAdapter } from './helpers/primitiveReactivity'

const tick = () => new Promise((resolve) => {
  setTimeout(resolve, 0)
})

interface Item { id: string, name: string }

/**
 * A collection with one live query on it, and the effect that reads it.
 * @returns The collection and the effect's spy, whose call count is the answer.
 */
const observed = () => {
  const collection = new Collection<Item>({ reactivity: primitiveReactivityAdapter })
  const effect = vi.fn()
  primitiveReactivity.effect(() => {
    effect(collection.find({}).count())
  })
  return { collection, effect }
}

beforeEach(() => {
  resetReactiveTransactions()
})

describe('reactiveTransaction', () => {
  it('re-runs a reactive scope once for several writes instead of once each', async () => {
    const { collection, effect } = observed()
    await tick()
    const initial = effect.mock.calls.length

    await reactiveTransaction(async () => {
      await collection.insert({ id: '1', name: 'one' })
      await tick()
      await collection.insert({ id: '2', name: 'two' })
      await tick()
      await collection.insert({ id: '3', name: 'three' })
      await tick()
      // The point of it: three separate write phases in, nothing has re-run.
      expect(effect.mock.calls.length).toBe(initial)
    })
    await tick()

    expect(effect.mock.calls.length).toBe(initial + 1)
    expect(effect).toHaveBeenLastCalledWith(3)
  })

  it('re-runs it once per write without one', async () => {
    const { collection, effect } = observed()
    await tick()
    const initial = effect.mock.calls.length

    await collection.insert({ id: '1', name: 'one' })
    await tick()
    await collection.insert({ id: '2', name: 'two' })
    await tick()

    expect(effect.mock.calls.length).toBe(initial + 2)
  })

  it('keeps the data current while it is open — only the wake-up waits', async () => {
    const { collection, effect } = observed()
    await tick()
    const initial = effect.mock.calls.length

    await reactiveTransaction(async () => {
      await collection.insert({ id: '1', name: 'one' })
      await tick()
      // Unlike a batch, the query pipeline keeps running: a read inside the
      // transaction sees the write it just made.
      expect(await collection.find({}, { async: true }).count()).toBe(1)
      expect(effect.mock.calls.length).toBe(initial)
    })
    await tick()

    expect(effect.mock.calls.length).toBe(initial + 1)
  })

  it('nests: an inner transaction joins the outer one', async () => {
    const { collection, effect } = observed()
    await tick()
    const initial = effect.mock.calls.length

    await reactiveTransaction(async () => {
      await collection.insert({ id: '1', name: 'one' })
      await tick()
      await reactiveTransaction(async () => {
        await collection.insert({ id: '2', name: 'two' })
        await tick()
      })
      // The inner one ending must not flush while the outer is open — a nested
      // `batch` being a passthrough is exactly the trap this avoids.
      expect(effect.mock.calls.length).toBe(initial)
      await collection.insert({ id: '3', name: 'three' })
      await tick()
    })
    await tick()

    expect(effect.mock.calls.length).toBe(initial + 1)
  })

  it('flushes what it held when the callback throws', async () => {
    const { collection, effect } = observed()
    await tick()
    const initial = effect.mock.calls.length

    await expect(reactiveTransaction(async () => {
      await collection.insert({ id: '1', name: 'one' })
      await tick()
      throw new Error('halfway')
    })).rejects.toThrow('halfway')
    await tick()

    // The write happened, so every reader has to hear about it: a transaction
    // that swallowed its notifications on failure would leave a screen showing
    // state that is no longer in the database.
    expect(effect.mock.calls.length).toBe(initial + 1)
    expect(isInReactiveTransaction()).toBe(false)
  })

  it('holds notifications while any of two overlapping transactions is open', async () => {
    const { collection, effect } = observed()
    await tick()
    const initial = effect.mock.calls.length

    const first = reactiveTransaction(async () => {
      await collection.insert({ id: '1', name: 'one' })
      await tick()
    })
    const second = reactiveTransaction(async () => {
      await tick()
      await tick()
      await collection.insert({ id: '2', name: 'two' })
      await tick()
    })
    await first
    expect(effect.mock.calls.length).toBe(initial)
    await second
    await tick()

    expect(effect.mock.calls.length).toBe(initial + 1)
  })

  it('does not wake a query that was disposed while it was open', async () => {
    const collection = new Collection<Item>({ reactivity: primitiveReactivityAdapter })
    const effect = vi.fn()
    let cursor: ReturnType<typeof collection.find> | undefined
    primitiveReactivity.effect(() => {
      cursor = collection.find({})
      effect(cursor.count())
    })
    await tick()
    const initial = effect.mock.calls.length

    await reactiveTransaction(async () => {
      await collection.insert({ id: '1', name: 'one' })
      await tick()
      cursor?.cleanup()
    })
    await tick()

    expect(effect.mock.calls.length).toBe(initial)
  })

  it('flushes and unwinds when a synchronous callback throws', () => {
    expect(() => reactiveTransaction(() => {
      throw new Error('immediately')
    })).toThrow('immediately')
    expect(isInReactiveTransaction()).toBe(false)
  })

  it('returns the callback value, synchronously for a synchronous callback', () => {
    expect(reactiveTransaction(() => 42)).toBe(42)
  })

  it('reports whether one is open', async () => {
    expect(isInReactiveTransaction()).toBe(false)
    await reactiveTransaction(async () => {
      expect(isInReactiveTransaction()).toBe(true)
      await tick()
      expect(isInReactiveTransaction()).toBe(true)
    })
    expect(isInReactiveTransaction()).toBe(false)
  })

  it('refuses anything but a callback', () => {
    // @ts-expect-error deliberately wrong
    expect(() => reactiveTransaction(42)).toThrow(TypeError)
  })
})
