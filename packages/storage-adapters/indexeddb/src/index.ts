import { createStorageAdapter } from '@signaldb/core'

// Utility: turn hangs into actionable errors.
/**
 * Wraps a Promise with a timeout that rejects with the given message if not settled in time.
 * @param p The Promise to wrap.
 * @param ms Timeout in milliseconds.
 * @param message Error message for the timeout rejection.
 * @returns A Promise that resolves/rejects as the original, or rejects on timeout.
 */
function withTimeout<T>(p: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null
  return new Promise<T>((resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
    p.then(
      (v) => {
        if (timer) clearTimeout(timer)
        resolve(v)
      },
      (error) => {
        if (timer) clearTimeout(timer)
        reject(error as Error)
      },
    )
  })
}

/**
 * Opens the IndexedDB database at its latest version (no upgrade).
 * @param databaseName Name of the database.
 * @returns Promise resolving to the open database.
 */
function openLatestDatabase(databaseName: string): Promise<IDBDatabase> {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName) // no version -> latest
    request.addEventListener('success', () => {
      const database = request.result
      // Always close promptly on versionchange to avoid blocking upgrades in other tabs.
      database.onversionchange = () => {
        try {
          database.close()
        } catch {
          // Swallow; the handle is closing or already closed.
        }
      }
      resolve(database)
    })
    request.addEventListener('error', () => reject(new Error(request.error?.message || 'Database error')))
  })
}

/**
 * Bumps the DB version by +1 and runs onUpgrade inside onupgradeneeded.
 * @param databaseName Name of the database.
 * @param onUpgrade Function to run inside onupgradeneeded.
 * @returns Promise resolving to the open database at the new version.
 */
async function upgradeDatabase(
  databaseName: string,
  onUpgrade: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
    newVersion: number | null,
  ) => Promise<void>,
): Promise<IDBDatabase> {
  // Get current version by opening latest first.
  const current = await openLatestDatabase(databaseName)
  const nextVersion = current.version + 1
  current.close()

  return withTimeout(new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, nextVersion)

    const upgradeDone = new Promise<void>((innerResolve, innerReject) => {
      let handled = false
      request.addEventListener('upgradeneeded', (event) => {
        handled = true
        const database = request.result
        const tx = request.transaction as IDBTransaction
        Promise.resolve(onUpgrade(database, tx, event.oldVersion, event.newVersion ?? null))
          .then(() => innerResolve())
          .catch(error => innerReject(error as Error))
      })
      // If another tab already performed the upgrade, no upgradeneeded will fire.
      // In that case, resolve on success so we don't hang and hit the 15s timeout.
      request.addEventListener('success', () => {
        if (!handled) innerResolve()
      })
    })

    request.addEventListener('success', () => {
      upgradeDone.then(() => {
        const database = request.result
        database.onversionchange = () => database.close()
        resolve(database)
      }).catch((error) => {
        request.result.close()
        reject(error as Error)
      })
    })
    request.addEventListener('error', () => reject(new Error(request.error?.message || 'Database error')))
  }), 15_000, 'IndexedDB upgrade timed out or was blocked. Close other tabs/windows using this database and retry.')
}

/**
 * Opens the IndexedDB database and creates the object store if it doesn't exist.
 * (Kept for compatibility; not used directly for lazy-store creation anymore.)
 * @param databaseName Name of the database.
 * @param version Version to open (or create) the database at.
 * @param onUpgrade Optional upgrade function to run if a version change occurs.
 * @returns Promise resolving to the open database.
 */
async function openDatabase(
  databaseName: string,
  version = 1,
  onUpgrade?: (
    database: IDBDatabase,
    transaction: IDBTransaction,
    oldVersion: number,
    newVersion: number | null,
  ) => Promise<void>,
): Promise<IDBDatabase> {
  const request = indexedDB.open(databaseName, version)
  const upgradePromise = new Promise<void>((resolve, reject) => {
    let handled = false
    request.addEventListener('upgradeneeded', (event) => {
      handled = true
      const database = request.result
      const tx = request.transaction as IDBTransaction
      if (onUpgrade) {
        Promise.resolve(onUpgrade(
          database,
          tx,
          event.oldVersion,
          event.newVersion ?? null,
        ))
          .then(() => resolve())
          .catch(error => reject(error as Error))
      } else {
        resolve()
      }
    })
    // If no upgrade is needed, ensure this Promise still resolves.
    request.addEventListener('success', () => {
      if (!handled) resolve()
    })
    request.addEventListener('error', () => reject(new Error(request.error?.message || 'Database error')))
  })
  const databasePromise = new Promise<IDBDatabase>((resolve, reject) => {
    request.addEventListener('success', () => {
      const database = request.result
      database.onversionchange = () => database.close()
      resolve(database)
    })
    request.addEventListener('error', () => reject(new Error(request.error?.message || 'Database error')))
  })
  await withTimeout(Promise.all([databasePromise, upgradePromise]), 15_000, 'IndexedDB open timed out (possibly blocked by another tab). Close other tabs and retry.')
  return databasePromise
}

type IndexedDatabaseAdapterOptions = {
  databaseName?: string,
  version?: number, // still supported; used only during initial setup if provided
  onUpgrade?: (
    database: IDBDatabase,
    oldVersion: number,
    newVersion: number | null,
  ) => Promise<void>,
}

/**
 * Creates a storage adapter using IndexedDB.
 * @param name The name of the object store within the database.
 * @param options Optional configuration options.
 * @returns A storage adapter instance.
 */
export default function createIndexedDBAdapter<
  T extends { id: I } & Record<string, any>,
  I extends IDBValidKey,
>(name: string, options?: IndexedDatabaseAdapterOptions) {
  const databaseName = options?.databaseName || 'signaldb'
  const storeName = `${name}`

  // Track index mutations requested before setup()
  let setupCalled = false
  const indexesToCreate = new Set<string>()
  const indexesToDrop = new Set<string>()

  let databasePromise: Promise<IDBDatabase> | null = null

  /**
   * Ensure the target store exists. If not, bump version and create it (and initial indexes).
   * Returns an open database handle at the latest version.
   * @returns Promise resolving to the open database.
   */
  const ensureStoreExists = async (): Promise<IDBDatabase> => {
    // Open latest
    let database = await openLatestDatabase(databaseName)

    if (database.objectStoreNames.contains(storeName)) {
      return database
    }

    // Bump version and create the store (and initial indexes if any were declared pre-setup).
    database.close()
    database = await upgradeDatabase(databaseName, async (databaseToUpgrade, tx) => {
      if (!databaseToUpgrade.objectStoreNames.contains(storeName)) {
        databaseToUpgrade.createObjectStore(storeName, {
          keyPath: 'id',
          autoIncrement: true,
        })
      }
      const store = tx.objectStore(storeName)

      // Apply any initial index mutations known before setup
      indexesToCreate.forEach((field) => {
        if (!store.indexNames.contains(field)) {
          store.createIndex(field, field, { unique: false, multiEntry: true })
        }
      })
      indexesToDrop.forEach((field) => {
        if (store.indexNames.contains(field)) {
          store.deleteIndex(field)
        }
      })
    })

    return database
  }

  /**
   * Get an object store. If the store is missing (or DB got closed), we create/upgrade and retry once.
   * @param writeAccess Whether to open the store with readwrite access. Defaults to false (readonly).
   * @returns Promise resolving to the object store.
   */
  const getStore = async (writeAccess = false): Promise<IDBObjectStore> => {
    // Prefer the adapter's DB if initialized, otherwise open latest.
    let database = databasePromise ? await databasePromise : await openLatestDatabase(databaseName)

    // Fast path: if the store is definitely missing on this handle, create it first.
    if (!database.objectStoreNames.contains(storeName)) {
      database = await ensureStoreExists()
      databasePromise = Promise.resolve(database)
    }

    const attempt = (): IDBObjectStore => {
      // Using the array form is a bit stricter in some browsers and avoids edge-case message differences
      const tx = database.transaction([storeName], writeAccess ? 'readwrite' : 'readonly')
      return tx.objectStore(storeName)
    }

    try {
      return attempt()
    } catch (error: any) {
      const notFound = (
        error?.name === 'NotFoundError'
        || (typeof error?.message === 'string' && /object stores? was not found/i.test(error.message as string))
        || !database.objectStoreNames.contains(storeName)
      )

      if (notFound) {
        // Ensure schema exists (handles races where another tab upgraded between our open and transaction call)
        database = await ensureStoreExists()
        databasePromise = Promise.resolve(database)
        try {
          return attempt()
        } catch {
          // Force a brand-new connection in case the previous one was invalidated mid-flight
          database = await openLatestDatabase(databaseName)
          databasePromise = Promise.resolve(database)
          if (!database.objectStoreNames.contains(storeName)) {
            database = await ensureStoreExists()
            databasePromise = Promise.resolve(database)
          }
          return attempt()
        }
      }

      if (error?.name === 'InvalidStateError') {
        // Handle closed/invalidated handles (e.g., onversionchange closed it)
        database = await openLatestDatabase(databaseName)
        databasePromise = Promise.resolve(database)
        if (!database.objectStoreNames.contains(storeName)) {
          database = await ensureStoreExists()
          databasePromise = Promise.resolve(database)
        }
        return attempt()
      }

      // Surface the original error if it wasn't one of the cases we can recover from.
      throw error
    }
  }

  const readIndex = async (field: string) => {
    const store = await getStore()
    if (!store.indexNames.contains(field)) {
      throw new Error(`Index on field "${field}" does not exist`)
    }

    const result = new Map<any, Set<I>>()

    // 1) Collect all records that appear in the index (defined/keyable values),
    // preserving IndexedDB semantics (including multiEntry behavior).
    await new Promise<void>((resolve, reject) => {
      const index = store.index(field)
      const request = index.openCursor()
      request.addEventListener('success', () => {
        const cursor = request.result
        if (!cursor) return resolve()
        const key = cursor.key as any
        const id = (cursor.value as T).id
        let bucket = result.get(key)
        if (!bucket) {
          bucket = new Set<I>()
          result.set(key, bucket)
        }
        bucket.add(id)
        cursor.continue()
      })
      request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error reading index')))
    })

    // 2) Add records where the field is nullish (null or undefined). These never appear in the index.
    await new Promise<void>((resolve, reject) => {
      const request = store.openCursor()
      request.addEventListener('success', () => {
        const cursor = request.result
        if (!cursor) return resolve()
        const value = (cursor.value)[field]
        if (value === undefined || value === null) {
          const id = (cursor.value as T).id
          const keyForMap = value // either undefined or null
          let bucket = result.get(keyForMap)
          if (!bucket) {
            bucket = new Set<I>()
            result.set(keyForMap, bucket)
          }
          bucket.add(id)
        }
        cursor.continue()
      })
      request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error scanning store')))
    })

    return result
  }

  return createStorageAdapter<T, I>({
    // lifecycle methods
    setup: async () => {
      setupCalled = true

      // 1) Open latest (or honor an explicit initial version if provided)
      databasePromise = typeof options?.version === 'number'
        ? openDatabase(
          databaseName,
          options.version,
          async (database, tx, oldV, newV) => {
            // If an explicit version is requested during first run, ensure store & indexes there.
            if (!database.objectStoreNames.contains(storeName)) {
              database.createObjectStore(storeName, {
                keyPath: 'id',
                autoIncrement: true,
              })
            }
            const store = tx.objectStore(storeName)
            indexesToCreate.forEach((field) => {
              if (!store.indexNames.contains(field)) {
                store.createIndex(field, field, { unique: false, multiEntry: true })
              }
            })
            indexesToDrop.forEach((field) => {
              if (store.indexNames.contains(field)) {
                store.deleteIndex(field)
              }
            })
            // Allow user-supplied upgrade hook last
            if (options?.onUpgrade) {
              await options.onUpgrade(database, oldV, newV)
            }
          },
        )
        // No explicit version: open latest first.
        : openLatestDatabase(databaseName)

      let database = await databasePromise

      // 2) If the store is missing OR we have pending index changes, do ONE upgrade now to batch them.
      const needStore = !database.objectStoreNames.contains(storeName)
      const needIndexChanges = indexesToCreate.size > 0 || indexesToDrop.size > 0

      if (needStore || needIndexChanges) {
        database.close()
        database = await upgradeDatabase(databaseName, async (
          databaseToUpgrade,
          tx,
          oldV,
          newV,
        ) => {
          if (!databaseToUpgrade.objectStoreNames.contains(storeName)) {
            databaseToUpgrade.createObjectStore(storeName, {
              keyPath: 'id',
              autoIncrement: true,
            })
          }
          const store = tx.objectStore(storeName)
          indexesToCreate.forEach((field) => {
            if (!store.indexNames.contains(field)) {
              store.createIndex(field, field, { unique: false, multiEntry: true })
            }
          })
          indexesToDrop.forEach((field) => {
            if (store.indexNames.contains(field)) {
              store.deleteIndex(field)
            }
          })
          if (options?.onUpgrade) {
            await options.onUpgrade(databaseToUpgrade, oldV, newV)
          }
        })
        databasePromise = Promise.resolve(database)
      }
    },

    teardown: async () => {
      if (!databasePromise) return
      const database = await databasePromise
      database.close()
      databasePromise = null
    },

    // data retrieval methods
    readAll: async () => {
      const store = await getStore()
      return new Promise<T[]>((resolve, reject) => {
        const request = store.getAll()
        request.addEventListener('success', () => resolve(request.result as T[]))
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error fetching items')))
      })
    },
    readIds: async (ids) => {
      const store = await getStore()
      const results = await Promise.all(ids.map(id => new Promise<T | null>((resolve, reject) => {
        const request = store.get(id)
        request.addEventListener('success', () => resolve((request.result as T) || null))
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error fetching item')))
      })))
      return results.filter(Boolean) as T[]
    },

    // index methods
    createIndex: async (field) => {
      if (setupCalled) throw new Error('createIndex must be called before setup()')
      if (field === 'id') throw new Error('Cannot create index on id field')
      indexesToCreate.add(field)
    },
    dropIndex: async (field) => {
      if (setupCalled) throw new Error('dropIndex must be called before setup()')
      indexesToDrop.add(field)
    },
    readIndex,

    // data manipulation methods
    insert: async (newItems) => {
      const store = await getStore(true)
      await Promise.all(newItems.map(item => new Promise<void>((resolve, reject) => {
        const request = store.add(item)
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error inserting item')))
      })))
    },
    replace: async (items) => {
      const store = await getStore(true)
      await Promise.all(items.map(item => new Promise<void>((resolve, reject) => {
        const request = store.put(item)
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error replacing item')))
      })))
    },
    remove: async (itemsToRemove) => {
      const store = await getStore(true)
      await Promise.all(itemsToRemove.map(async item => new Promise<void>((resolve, reject) => {
        const request = store.delete(item.id)
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error removing item')))
      })))
    },
    removeAll: async () => {
      const store = await getStore(true)
      return new Promise<void>((resolve, reject) => {
        const request = store.clear()
        request.addEventListener('success', () => resolve())
        request.addEventListener('error', () => reject(new Error(request.error?.message || 'Error clearing items')))
      })
    },
  })
}
