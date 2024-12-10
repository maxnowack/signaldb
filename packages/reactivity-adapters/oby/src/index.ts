import $oby, {
  untrack,
  cleanup,
  owner,
} from 'oby'
import { createReactivityAdapter } from '@signaldb/core'

const obyReactivityAdapter = createReactivityAdapter({
  create: () => {
    const dep = $oby(0)
    return {
      depend: () => {
        dep()
      },
      notify: () => {
        dep(untrack(() => dep() + 1))
      },
    }
  },
  isInScope: () => !!owner(),
  onDispose: (callback) => {
    cleanup(callback)
  },
})

export default obyReactivityAdapter
