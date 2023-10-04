import { vi, describe, it, expect } from 'vitest'
import { Tracker } from 'meteor-ts-tracker'
import {
  signal as maverickSignal,
  tick as maverickTick,
  peek as maverickPeek,
  effect as maverickEffect,
  getScope as maverickGetScope,
  onDispose as maverickOnDispose,
} from '@maverick-js/signals'
import $oby, {
  effect as obyEffect,
  untrack as obyUntrack,
  cleanup as obyCleanup,
  owner as obyOwner,
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
import { reactive as reactively, onCleanup as reactivelyOnCleanup } from '@reactively/core'
import S from 's-js'
import {
  observable as mobxObservable,
  autorun as mobxAutorun,
  runInAction as mobxRunInAction,
  onBecomeUnobserved as mobxOnBecomeUnobserved,
} from 'mobx'
// import {
//   createSignal as solidSignal,
//   createEffect as solidEffect,
//   onCleanup as solidCleanup,
//   createRoot as solidCreateRoot,
// } from 'solid-js'
// import {
//   signal as angularSignal,
//   effect as angularEffect,
//   untracked as angularUntracked,
// } from '@angular/core'
import { Collection, createReactivityAdapter } from '../src/index'

describe('Reactivity', () => {
  describe('Tracker', () => {
    const reactivity = createReactivityAdapter({
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
      isInScope: () => Tracker.active,
      onDispose: vi.fn((callback) => {
        if (!Tracker.active) return
        Tracker.onInvalidate(callback)
      }),
    })

    it('should be reactive with Tracker', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      Tracker.autorun(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      Tracker.flush()
      collection.insert({ id: '1', name: 'John' })
      Tracker.flush()
      expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
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
    const reactivity = createReactivityAdapter({
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
      isInScope: () => !!maverickGetScope(),
      onDispose: vi.fn((callback) => {
        maverickOnDispose(callback)
      }),
    })

    it('should be reactive with @maverick-js/signals', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      maverickEffect(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      maverickTick()
      collection.insert({ id: '1', name: 'John' })
      maverickTick()
      expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('oby', () => {
    const reactivity = createReactivityAdapter({
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
      isInScope: () => !!obyOwner(),
      onDispose: vi.fn((callback) => {
        obyCleanup(callback)
      }),
    })

    it('should be reactive with oby', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      obyEffect(() => {
        callback(collection.find({ name: 'John' }).count())
      })
      obyTick()
      collection.insert({ id: '1', name: 'John' })
      obyTick()
      expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('usignal', () => {
    const reactivity = createReactivityAdapter({
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
    })

    it('should be reactive with usignal', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()
      const cleanup = vi.fn()

      uEffect(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
        return () => {
          cleanup()
          cursor.cleanup()
        }
      })
      collection.insert({ id: '1', name: 'John' })
      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('sinuous', () => {
    const reactivity = createReactivityAdapter({
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
      onDispose: vi.fn((callback) => {
        sinuousApi.cleanup(callback)
      }),
    })

    it('should be reactive with sinuous', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      sinuousApi.subscribe(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
      })
      collection.insert({ id: '1', name: 'John' })
      expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('preact', () => {
    const reactivity = createReactivityAdapter({
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
    })

    it('should be reactive with preact', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()
      const cleanup = vi.fn()

      preactEffect(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
        return () => {
          cleanup()
          cursor.cleanup()
        }
      })
      collection.insert({ id: '1', name: 'John' })
      expect(cleanup).toHaveBeenCalledTimes(1)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('@reactively/core', () => {
    const reactivity = createReactivityAdapter({
      create: () => {
        const dep = reactively(0)
        return {
          depend: () => {
            dep.get()
          },
          notify: () => {
            dep.set(dep.value + 1)
          },
        }
      },
      onDispose: vi.fn((callback) => {
        reactivelyOnCleanup(callback)
      }),
    })

    it('should be reactive with reactively', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      const exec = reactively(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
      })
      exec.get()
      collection.insert({ id: '1', name: 'John' })
      exec.get()

      expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('S.js', () => {
    const reactivity = createReactivityAdapter({
      create: () => {
        const dep = S.data(true)
        return {
          depend: () => {
            dep()
          },
          notify: () => {
            dep(true)
          },
        }
      },
      onDispose: vi.fn((callback) => {
        S.cleanup(callback)
      }),
    })

    it('should be reactive with S.js', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      S(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
      })
      collection.insert({ id: '1', name: 'John' })
      expect(reactivity.onDispose).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
    })
  })

  describe('MobX', () => {
    const reactivity = createReactivityAdapter({
      create: () => {
        const dep = mobxObservable({ count: 0 })
        return {
          depend: () => {
            // eslint-disable-next-line no-unused-expressions
            dep.count
          },
          notify: () => {
            mobxRunInAction(() => {
              dep.count += 1
            })
          },
          raw: dep,
        }
      },
      onDispose(callback, { raw: dep }) {
        mobxOnBecomeUnobserved(dep, 'count', callback)
      },
    })

    it('should be reactive with MobX', () => {
      const collection = new Collection({ reactivity })
      const callback = vi.fn()

      const stop = mobxAutorun(() => {
        const cursor = collection.find({ name: 'John' })
        callback(cursor.count())
      })
      collection.insert({ id: '1', name: 'John' })
      expect(callback).toHaveBeenCalledTimes(2)
      expect(callback).toHaveBeenLastCalledWith(1)
      stop()
    })
  })

  // Testing angular is a bit tricky and I haven't figured out how to do it yet. Feel free to open a PR
  // eslint-disable-next-line vitest/no-commented-out-tests
  // describe('angular', () => {
  //   const reactivity = createReactivityAdapter({
  //     create: () => {
  //       const dep = angularSignal(0)
  //       return {
  //         depend: () => {
  //           dep()
  //         },
  //         notify: () => {
  //           dep.set(angularUntracked(() => dep() + 1))
  //         },
  //       }
  //     },
  //   })

  // eslint-disable-next-line vitest/no-commented-out-tests
  //   it('should be reactive with angular signals', () => {
  //     const collection = new Collection({ reactivity })
  //     const callback = vi.fn()
  //     const cleanup = vi.fn()

  //     angularEffect((onCleanup) => {
  //       const cursor = collection.find({ name: 'John' })
  //       callback(cursor.count())
  //       onCleanup(() => {
  //         cleanup()
  //         cursor.cleanup()
  //       })
  //     })
  //     collection.insert({ id: '1', name: 'John' })
  //     expect(cleanup).toHaveBeenCalledTimes(1)
  //     expect(callback).toHaveBeenCalledTimes(2)
  //     expect(callback).toHaveBeenLastCalledWith(1)
  //   })
  // })

  // solid doenst work in a node environment since createEffect won't run
  // eslint-disable-next-line vitest/no-commented-out-tests
  // describe('solid', () => {
  //   const reactivity = createReactivityAdapter({
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
  //   })

  // eslint-disable-next-line vitest/no-commented-out-tests
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
