import { Collection } from '@signaldb/core'

const devtoolsInProductionWarning = `


!! WARNING !!
You are running @signaldb/devtools in production mode.
This can have a negative impact on performance and may expose sensitive information.
Please don't import @signaldb/devtools in production code and move it to development dependencies.


`

/**
 * Loads the devtools in production mode and logs a warning if in production.
 */
function loadDeveloperTools() {
  const isProduction = process.env.NODE_ENV === 'production'
  void import('./setup').then(() => {
    Collection.enableDebugMode()

    // eslint-disable-next-line no-console
    if (isProduction) console.warn(devtoolsInProductionWarning)
  })
}

loadDeveloperTools()
