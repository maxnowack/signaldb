import { vi, describe, it, expect } from 'vitest'
import { Collection, createReactivityAdapter } from '../src'
import deepClone from '../src/utils/deepClone'

const primitiveReactivity = (() => {
  class Computation {
    effectCallback: () => void
    onInvalidateCallbacks: (() => void)[] = []
    constructor(effectCallback: () => void) {
      this.effectCallback = effectCallback
    }

    onInvalidate(callback: () => void) {
      this.onInvalidateCallbacks.push(callback)
    }

    invalidate() {
      this.onInvalidateCallbacks.forEach(callback => callback())
    }
  }

  let currentComputation: Computation | null = null
  let lastComputation: Computation | null = null

  /**
   * Creates a reactive signal with an initial value.
   * @template T
   * @param initialValue - The initial value of the signal.
   * @returns The reactive signal.
   */
  function signal<T>(initialValue: T) {
    let value = initialValue
    const computationDeps = new Set<Computation>()
    const signalValue = () => {
      if (currentComputation) computationDeps.add(currentComputation)
      return value
    }
    signalValue.set = (newValue: T) => {
      value = newValue
      computationDeps.forEach(computation => computation.effectCallback())
    }
    return signalValue
  }
  const effect = (callback: () => void) => {
    const effectCallback = () => {
      if (lastComputation) lastComputation.invalidate()
      currentComputation = new Computation(effectCallback)
      lastComputation = currentComputation
      callback()
      currentComputation = null
    }
    effectCallback()
  }
  /**
   * Temporarily suspends reactivity tracking for the duration of the callback.
   * @param callback - The callback function to execute without reactivity tracking.
   * @returns The result of the callback function.
   */
  function peek<T>(callback: () => T) {
    const previousComputation = currentComputation
    currentComputation = null
    const result = callback()
    currentComputation = previousComputation
    return result
  }
  return {
    effect,
    signal,
    peek,
    getCurrentComputation: () => currentComputation,
  }
})()
const primitiveReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = primitiveReactivity.signal(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep.set(primitiveReactivity.peek(() => dep() + 1))
      },
    }
  },
  onDispose: (dispose) => {
    primitiveReactivity.getCurrentComputation()?.onInvalidate(dispose)
  },
  isInScope: () => !!primitiveReactivity.getCurrentComputation(),
})

const tick = () => new Promise((resolve) => {
  setTimeout(resolve, 0)
})

describe('reactivity primitives', () => {
  it('should be reactive with primitive adapter', async () => {
    const collection = new Collection({ reactivity: primitiveReactivityAdapter })
    const callback = vi.fn()

    primitiveReactivity.effect(() => {
      callback(collection.find({ name: 'John' }).count())
    })
    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith(0)

    await tick()
    await collection.insert({ id: '1', name: 'John' })
    await tick()

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(1)
  })

  it('should call dispose on cleanup', async () => {
    const reactivity = primitiveReactivityAdapter
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unnecessary-type-assertion
    reactivity.onDispose = vi.fn(reactivity.onDispose!)

    const collection = new Collection({ reactivity })

    primitiveReactivity.effect(() => {
      collection.find({ name: 'John' }).count()
    })
    expect(reactivity.onDispose).toHaveBeenCalledTimes(1)
    await tick()

    await collection.insert({ id: '1', name: 'John' })
    await tick()
    expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
  })

  it('should be reactive on updates', async () => {
    const collection = new Collection({ reactivity: primitiveReactivityAdapter })
    const callback = vi.fn()

    primitiveReactivity.effect(() => {
      const items = collection.find({ name: 'John' }).fetch()
      callback(items)
    })
    await tick()

    await collection.insert({ id: '1', name: 'John' })
    await tick()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith([{ id: '1', name: 'John' }])

    await collection.updateOne({ id: '1' }, { $set: { updated: true } })
    await tick()

    expect(callback).toHaveBeenCalledTimes(3)
    expect(callback).toHaveBeenLastCalledWith([{ id: '1', name: 'John', updated: true }])

    await collection.updateOne({ id: '1' }, { $set: { updated: 2 } })
    await tick()

    expect(callback).toHaveBeenCalledTimes(4)
    expect(callback).toHaveBeenLastCalledWith([{ id: '1', name: 'John', updated: 2 }])
  })

  it('should be reactive on dot notation fields updates', async () => {
    const collection = new Collection({ reactivity: primitiveReactivityAdapter })
    const callback = vi.fn()

    primitiveReactivity.effect(() => {
      const items = collection.find({ name: 'John' }).fetch()
      callback(deepClone(items))
    })
    await collection.insert({ id: '1', name: 'John', count: { a: 1 } })
    await tick()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith([{ id: '1', name: 'John', count: { a: 1 } }])

    await collection.updateOne({ name: 'John' }, {
      $set: { 'count.a': 2 },
    })
    await tick()

    expect(callback).toHaveBeenCalledTimes(3)
    expect(callback).toHaveBeenLastCalledWith([{ id: '1', name: 'John', count: { a: 2 } }])
  })

  it('should be reactive with field-level tracking', async () => {
    const collection = new Collection({ reactivity: primitiveReactivityAdapter })
    const callback = vi.fn()
    await collection.insert({ id: '1', name: 'John', postCount: 20, age: 30 })

    primitiveReactivity.effect(() => {
      const items = collection.find({ name: 'John' }, {
        fieldTracking: true,
      }).fetch()
      callback(items.map(item => item.postCount))
    })
    await tick()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith([20])

    await collection.updateOne({ id: '1' }, { $set: { postCount: 21 } })
    await tick()

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith([21])

    await collection.updateOne({ id: '1' }, { $set: { age: 35 } })
    await tick()

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith([21])
  })

  it('should be reactive with field-level tracking on item level', async () => {
    const collection = new Collection({ reactivity: primitiveReactivityAdapter })
    const callback = vi.fn()
    await collection.insert({ id: '1', name: 'John', postCount: 20, age: 30 })
    await collection.insert({ id: '2', name: 'Jane', postCount: 40, age: 20 })

    primitiveReactivity.effect(() => {
      const items = collection.find({}, {
        fieldTracking: true,
        sort: { postCount: -1 },
      }).fetch()
      callback(items[0].postCount)
    })
    await tick()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith(40)

    await collection.updateOne({ name: 'John' }, { $set: { postCount: 21 } })
    await tick()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith(40)

    await collection.updateOne({ name: 'Jane' }, { $set: { age: 35 } })
    await tick()

    expect(callback).toHaveBeenCalledTimes(1)
    expect(callback).toHaveBeenLastCalledWith(40)

    await collection.updateOne({ name: 'Jane' }, { $set: { postCount: 35 } })
    await tick()

    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith(35)
  })

  it('should be reactive transformAll after fields updates', async () => {
    const col1 = new Collection({ reactivity: primitiveReactivityAdapter })
    col1.insert({ id: '1', name: 'John' })
    col1.insert({ id: '2', name: 'Jane' })

    const col2 = new Collection({
      reactivity: primitiveReactivityAdapter,
      transformAll: (items, fields) => {
        if (fields?.parent) {
          const foreignKeys = [...new Set(items.map(item => item.parent))]
          const relatedItems = col1.find({ id: { $in: foreignKeys } }).fetch()
          items.forEach((item) => {
            item.parent = relatedItems.find(related => related.id === item.parent)
          })
        }
        return items
      },
    })
    const callback = vi.fn()

    primitiveReactivity.effect(() => {
      const items = col2.find({}, { fields: { id: 1, name: 1, parent: 1 } }).fetch()
      callback(deepClone(items))
    })

    col2.insert({ id: '1', name: 'John', parent: '1' })
    await tick()
    expect(callback).toHaveBeenCalledTimes(2)
    expect(callback).toHaveBeenLastCalledWith([{ id: '1', name: 'John', parent: { id: '1', name: 'John' } }])

    col1.updateOne({ name: 'John' }, {
      $set: { name: 'John Jr' },
    })
    await tick()

    expect(callback).toHaveBeenCalledTimes(3)
    expect(callback).toHaveBeenLastCalledWith([{ id: '1', name: 'John', parent: { id: '1', name: 'John Jr' } }])
  })
})
