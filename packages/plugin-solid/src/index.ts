import {
  createSignal,
  onCleanup,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
} from 'solid-js/dist/solid'
import { createReactivityAdapter } from 'signaldb'

/**
 * Reactivity adapter for Solid. See https://signaldb.js.org/reactivity/solid/ for more information.
 */
export const solidReactivityAdapter = createReactivityAdapter({
  create: () => {
    const [depend, rerun] = createSignal(undefined, { equals: false })
    return {
      depend: () => {
        depend()
      },
      notify: () => {
        rerun()
      },
    }
  },
  isInScope: undefined,
  onDispose: (callback) => {
    onCleanup(callback)
  },
})

export default solidReactivityAdapter
