import { vi, describe, it, expect } from 'vitest'
import { Tracker } from 'meteor-ts-tracker'
import {
  signal as maverickSignal,
  tick as maverickTick,
  peek as maverickPeek,
  effect as maverickEffect,
  onDispose as maverickOnDispose,
} from '@maverick-js/signals'
import $oby, {
  effect as obyEffect,
  untrack as obyUntrack,
  cleanup as obyCleanup,
  tick as obyTick,
} from 'oby'
import {
  signal as uSignal,
  effect as uEffect,
} from 'usignal'
import {
  observable as sinuousObservable,
  api as sinuousApi,
} from 'sinuous'
import {
  signal as preactSignal,
  effect as preactEffect,
} from '@preact/signals-core'
// import {
//   createSignal as solidSignal,
//   createEffect as solidEffect,
//   onCleanup as solidCleanup,
//   createRoot as solidCreateRoot,
// } from 'solid-js'
import type { ReactivityAdapter } from 'index'
import { Collection } from 'index'

describe('Reactivity', () => {
  describe('Tracker', () => {
    const reactivity: ReactivityAdapter = {
      create: () => {
        const dep = new Tracker.Dependency()
        return {
          depend: () => {
            if (!Tracker.active) return
            dep.depend()
          },
          notify: () => dep.changed(),
        }
      },
      onDispose: (callback) => {
        Tracker.onInvalidate(callback)
      },
    }

    it('should be reactive with Tracker', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      Tracker.autorun(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      Tracker.flush()
      collection.insert({ id: '1', name: 'John' })
      Tracker.flush()
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })

    it('should allow overriding reactivity primitives for query', () => {
      const collection = new Collection()
      const callback = vi.fn()

      Tracker.autorun(() => {
        callback(collection.find({ name: 'John' }, {
          reactive: reactivity,
        }).count())
      })
      Tracker.flush()
      collection.insert({ id: '1', name: 'John' })
      Tracker.flush()
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('@maverick-js/signals', () => {
    const reactivity: ReactivityAdapter = {
      create: () => {
        const dep = maverickSignal(0)
        return {
          depend: () => {
            dep()
          },
          notify: () => {
            dep.set(maverickPeek(() => dep() + 1))
          },
        }
      },
      onDispose: (callback) => {
        maverickOnDispose(callback)
      },
    }

    it('should be reactive with @maverick-js/signals', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      maverickEffect(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      maverickTick()
      collection.insert({ id: '1', name: 'John' })
      maverickTick()
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('oby', () => {
    const reactivity: ReactivityAdapter = {
      create: () => {
        const dep = $oby(0)
        return {
          depend: () => {
            dep()
          },
          notify: () => {
            dep(obyUntrack(() => dep() + 1))
          },
        }
      },
      onDispose: (callback) => {
        obyCleanup(callback)
      },
    }

    it('should be reactive with oby', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      obyEffect(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      obyTick()
      collection.insert({ id: '1', name: 'John' })
      obyTick()
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('usignal', () => {
    const reactivity: ReactivityAdapter = {
      create: () => {
        const dep = uSignal(0)
        return {
          depend: () => {
            // eslint-disable-next-line no-unused-expressions
            dep.value
          },
          notify: () => {
            dep.value = dep.peek() + 1
          },
        }
      },
    }

    it('should be reactive with usignal', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      uEffect(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      collection.insert({ id: '1', name: 'John' })
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('sinuous', () => {
    const reactivity: ReactivityAdapter = {
      create: () => {
        const dep = sinuousObservable(0)
        return {
          depend: () => {
            dep()
          },
          notify: () => {
            dep(sinuousApi.sample(() => dep()) + 1)
          },
        }
      },
      onDispose: (callback) => {
        sinuousApi.cleanup(callback)
      },
    }

    it('should be reactive with sinuous', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      sinuousApi.subscribe(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
      })
      collection.insert({ id: '1', name: 'John' })
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('preact', () => {
    const reactivity: ReactivityAdapter = {
      create: () => {
        const dep = preactSignal(0)
        return {
          depend: () => {
            // eslint-disable-next-line no-unused-expressions
            dep.value
          },
          notify: () => {
            dep.value = dep.peek() + 1
          },
        }
      },
    }

    it('should be reactive with preact', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      preactEffect(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
        return () => {
          cursor.cleanup()
        }
      })
      collection.insert({ id: '1', name: 'John' })
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  // solid doenst work in a node environment since createEffect won't run
  // describe('solid', () => {
  //   const reactivity: ReactivityAdapter = {
  //     create: () => {
  //       const [depend, rerun] = solidSignal(undefined, { equals: false })
  //       return {
  //         depend: () => {
  //           depend()
  //         },
  //         notify: () => {
  //           rerun()
  //         },
  //       }
  //     },
  //     onDispose: (callback) => {
  //       solidCleanup(callback)
  //     },
  //   }

  //   it('should be reactive with solid', () => {
  //     const callback = vi.fn()
  //     solidCreateRoot(() => {
  //       const collection = new Collection({ reactivity })

  //       const cursor = collection.find({ name: 'John' })
  //       solidEffect(() => {
  //         callback(cursor.count())
  //       })
  //       collection.insert({ id: '1', name: 'John' })
  //     })
  //     expect(callback).toHaveBeenCalledTimes(2)
  //     expect(callback).toHaveBeenLastCalledWith(1)
  //   })
  // })
})
