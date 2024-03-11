export default function executeOncePerTick(
  callback: () => void,
  alwaysScheduleNextTick = false,
) {
  let executed = alwaysScheduleNextTick
  let executeNextTick = false
  let resetTimeout: NodeJS.Timeout | null = null
  return () => {
    if ((!executed || !executeNextTick) && resetTimeout) clearTimeout(resetTimeout)

    if (executed) {
      if (executeNextTick) return

      setTimeout(() => {
        callback()
        executeNextTick = false
        if (alwaysScheduleNextTick) executed = true
      }, 0)
      executeNextTick = true
      return
    }
    executed = true
    callback()

    resetTimeout = setTimeout(() => {
      executed = false
    }, 0)
  }
}
