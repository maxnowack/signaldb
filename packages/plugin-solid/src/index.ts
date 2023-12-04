import {
  createSignal,
  onCleanup,
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
} from 'solid-js/dist/solid'
import { createReactivityAdapter } from 'signaldb'

const solidReactivityAdapter = createReactivityAdapter({
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
