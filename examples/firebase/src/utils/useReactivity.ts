import { effect } from '@maverick-js/signals'
import { createUseReactivityHook } from '@signaldb/react'

const useReactivity = createUseReactivityHook(effect)

export default useReactivity
