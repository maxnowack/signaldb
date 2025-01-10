/* istanbul ignore file -- @preserve */
import Collection from './Collection'

const devtoolsInProductionWarning = `


[@signaldb/core] !! WARNING !!
You are running @signaldb/devtools in production mode.
This can have a negative impact on performance and may expose sensitive information.
Please move @signaldb/devtools to development dependencies to disable it in production.


`

/**
 * A small helper type for Node errors, allowing us to check the `code` property.
 */
type NodeError = Error & {
  code?: string,
}

/**
 * Type guard to detect if an error is a Node error with a `code`.
 * @param error The error to check.
 * @returns True if the error is a Node error with a `code` property, false otherwise.
 */
function isNodeErrorWithCode(error: unknown): error is NodeError {
  return (
    typeof error === 'object'
    && error !== null
    && 'code' in error
    && typeof (error as NodeError).code === 'string'
  )
}

/**
 * Helper to detect if we're in a CommonJS environment.
 * @returns True if we're in a CommonJS environment, false otherwise.
 */
function isCommonJS(): boolean {
  return typeof module !== 'undefined' && !!(module as any).exports
}

/**
 * Checks if `@signaldb/devtools` is available by attempting different loading strategies:
 * 1. CommonJS `require.resolve` if available
 * 2. ESM dynamic import
 * 3. Optional `createRequire` fallback in ESM (Node 12.2+)
 * @returns A promise resolving to true if available, otherwise false.
 */
async function checkDevtoolsAvailability(): Promise<boolean> {
  // if we're not in a client environment, we can't load devtools
  // eslint-disable-next-line unicorn/prefer-global-this
  if (typeof window === 'undefined') {
    return false
  }

  // 1. If we have CommonJS, try `require.resolve`
  if (isCommonJS()) {
    try {
      require.resolve('@signaldb/devtools')
      return true
    } catch {
      return false
    }
  }

  // 2. If we are in a pure ESM environment, try dynamic import
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await import('@signaldb/devtools')
    return true
  } catch (error) {
    // In some Node ESM cases, dynamic import might fail due to lack of the module.
    // We'll attempt `createRequire` as a last resort if the error is specifically MODULE_NOT_FOUND.
    if (!isNodeErrorWithCode(error) || error.code !== 'MODULE_NOT_FOUND') {
      // It's some other error, so rethrow
      throw error
    }
  }

  // 3. Attempt createRequire for Node ESM in case the dynamic import path was blocked.
  try {
    // We do a dynamic import of 'module', which is only valid in Node 12.2+.
    const modulePackage = await import('module')
    const createRequireFunction = modulePackage.default.createRequire
    const cjsRequire = createRequireFunction(import.meta.url)
    cjsRequire.resolve('@signaldb/devtools')
    return true
  } catch {
    // If that fails, we consider it not available
    return false
  }
}

/**
 * Loads `@signaldb/devtools` by the same strategy:
 * 1. Use CommonJS require if available
 * 2. Use dynamic import (ESM)
 * 3. Use createRequire fallback in ESM
 * @returns A promise that resolves to `true` if the devtools module was loaded, `false` otherwise.
 */
async function checkAndImportDevtools(): Promise<boolean> {
  // Ensure it's actually possible to resolve
  const available = await checkDevtoolsAvailability()
  if (!available) return false

  // 1. CommonJS path
  if (isCommonJS()) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      require('@signaldb/devtools')
      return true
    } catch (error) {
      if (isNodeErrorWithCode(error) && error.code === 'MODULE_NOT_FOUND') {
        return false
      }
      throw error
    }
  }

  // 2. Dynamic import in ESM
  try {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await import('@signaldb/devtools')
    return true
  } catch (error) {
    // If we got here, try the createRequire fallback
    if (!isNodeErrorWithCode(error) || error.code !== 'MODULE_NOT_FOUND') {
      throw error
    }
  }

  // 3. createRequire fallback in ESM
  try {
    const modulePackage = await import('module')
    const createRequireFunction = modulePackage.default.createRequire
    const cjsRequire = createRequireFunction(import.meta.url)
    cjsRequire('@signaldb/devtools')
    return true
  } catch (error) {
    if (isNodeErrorWithCode(error) && error.code === 'MODULE_NOT_FOUND') {
      return false
    }
    throw error
  }
}

/**
 * Loads the devtools in production mode and logs a warning if in production.
 */
export default function loadDeveloperTools() {
  const isProduction = process.env.NODE_ENV === 'production'
  void checkAndImportDevtools().then((devtoolsLoaded) => {
    if (!devtoolsLoaded) return

    Collection.enableDebugMode()

    // eslint-disable-next-line no-console
    if (isProduction) console.warn(devtoolsInProductionWarning)
  })
}
