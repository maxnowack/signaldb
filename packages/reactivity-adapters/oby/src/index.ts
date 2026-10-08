import $oby, {
  untrack,
  cleanup,
  owner,
} from 'oby'
import { createReactivityAdapter } from '@signaldb/core'

const obyReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dependency = $oby(0)
    return {
      depend: () => {
        dependency()
      },
      notify: () => {
        dependency(untrack(() => dependency() + 1))
      },
    }
  },
  isInScope: () => !!owner(),
  onDispose: (callback) => {
    cleanup(callback)
  },
})

export default obyReactivityAdapter
