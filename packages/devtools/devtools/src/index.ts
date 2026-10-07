import { Collection } from '@signaldb/core'

const devtoolsInProductionWarning = `


!! WARNING !!
You are running @signaldb/devtools in production mode.
This can have a negative impact on performance and may expose sensitive information.
Please don't import @signaldb/devtools in production code and move it to development dependencies.


`

/**
 * Loads the devtools and enables debug mode for all collections. The devtools are loaded in
 * production builds as well; a warning is logged in that case.
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
