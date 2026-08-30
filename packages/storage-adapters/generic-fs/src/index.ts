import { createStorageAdapter, get } from '@signaldb/core'
import {
  accumulateUpsertDelta,
  accumulateRemoveDelta,
  type IndexDelta,
} from './deltaHelpers'

/**
 * A driver interface that abstracts low-level filesystem operations.
 * Implementations can back this with Node.js fs/promises, browser FS APIs, or other storage mechanisms.
 */
export interface Driver<
  T extends { id: I } & Record<string, unknown>,
  I,
> {
  fileNameForId(id: I): Promise<string>,
  fileNameForIndexKey(key: string): Promise<string>,
  joinPath(...parts: string[]): Promise<string>,
  ensureDir(path: string): Promise<void>,
  fileExists(path: string): Promise<boolean>,
  readObject(path: string): Promise<T[] | null>,
  writeObject(path: string, value: T[]): Promise<void>,
  readIndexObject(path: string): Promise<Record<string, I[]>[] | null>,
  writeIndexObject(path: string, value: Record<string, I[]>[]): Promise<void>,
  listFilesRecursive(directoryPath: string): Promise<string[]>,
  removeEntry(path: string, options?: { recursive?: boolean }): Promise<void>,
}

/**
 * Creates a storage adapter for managing a SignalDB collection using a generic filesystem-like driver.
 * Data is sharded into subdirectories based on item identifiers, and indices are maintained as files.
 * @param driver - The driver that handles low-level file operations.
 * @param folderName - The root folder path for storing the collection data.
 * @returns A SignalDB storage adapter for managing data in a filesystem-like storage.
 */
export default function createGenericFSAdapter<
  T extends { id: I } & Record<string, unknown>,
  I,
>(
  driver: Driver<T, I>,
  folderName: string,
) {
  const itemsDirectoryPathPromise = driver.joinPath(folderName, 'items')
  const indexRootPathPromise = driver.joinPath(folderName, 'index')

  const safeFileExists = async (path: string): Promise<boolean> =>
    driver.fileExists(path).catch(() => false)

  const safeRemoveEntry = async (path: string, options?: { recursive?: boolean }) =>
    driver.removeEntry(path, options).catch(() => { /* ignore */ })

  const toItemsFilePath = async (identifier: I): Promise<string> =>
    driver.joinPath(await itemsDirectoryPathPromise, await driver.fileNameForId(identifier))

  const toIndexPathForField = async (fieldPath: string): Promise<string> =>
    driver.joinPath(await indexRootPathPromise, await driver.fileNameForIndexKey(fieldPath))

  const toIndexBucketFilePath = async (indexPath: string, rawKey: string): Promise<string> => {
    const bucketFileName = await driver.fileNameForIndexKey(rawKey)
    return driver.joinPath(indexPath, bucketFileName)
  }

  const readItemsArrayOrEmpty = async (filePath: string): Promise<T[]> => {
    const exists = await safeFileExists(filePath)
    if (!exists) return []
    const data = await driver.readObject(filePath).catch(() => [])
    return Array.isArray(data) ? data : []
  }

  const loadBucketIndexFromData = <K extends string>(
    data: Record<K, I[]>[] | null,
  ): Map<string, Set<I>> => {
    const bucketIndex = new Map<string, Set<I>>()
    if (!Array.isArray(data)) return bucketIndex
    for (const entry of data) {
      for (const [rawKey, identifierList] of Object.entries(entry)) {
        bucketIndex.set(rawKey, new Set(identifierList as I[]))
      }
    }
    return bucketIndex
  }

  const writeBucketIndex = async (
    filePath: string,
    bucketIndex: Map<string, Set<I>>,
  ) => {
    if (bucketIndex.size === 0) {
      const exists = await safeFileExists(filePath)
      if (exists) await safeRemoveEntry(filePath)
      return
    }
    const output: Record<string, I[]>[] = []
    bucketIndex.forEach((identifierSet, rawKey) => {
      output.push({ [rawKey]: [...identifierSet] as I[] })
    })
    await driver.writeIndexObject(filePath, output)
  }

  const readBucketIndex = async (filePath: string): Promise<Map<string, Set<I>>> => {
    const data = await driver.readIndexObject(filePath).catch(() => null)
    return loadBucketIndexFromData(data)
  }

  const readAll = async (): Promise<T[]> => {
    const itemsDirectoryPath = await itemsDirectoryPathPromise
    const directoryExists = await safeFileExists(itemsDirectoryPath)
    if (!directoryExists) return []

    const relativeFiles = await driver.listFilesRecursive(itemsDirectoryPath)
    const aggregatedItems: T[] = []

    await Promise.all(
      relativeFiles.map(async (relativePath) => {
        const fullPath = await driver.joinPath(itemsDirectoryPath, relativePath)
        const itemsInFile = await driver.readObject(fullPath).catch(() => null)
        if (Array.isArray(itemsInFile)) aggregatedItems.push(...itemsInFile)
      }),
    )

    return aggregatedItems
  }

  const ensureIndex = async (
    fieldPath: string,
    itemsPromise: Promise<T[]> = readAll(),
  ): Promise<void> => {
    const allItems = await itemsPromise
    const indexPath = await toIndexPathForField(fieldPath)

    await safeRemoveEntry(indexPath, { recursive: true })
    await driver.ensureDir(indexPath)

    // Build value -> Set<identifier>
    const indexMap = new Map<string, Set<I>>()
    for (const item of allItems) {
      const fieldValue = get(item, fieldPath)
      if (fieldValue == null) continue
      const keyString = String(fieldValue)
      if (!indexMap.has(keyString)) indexMap.set(keyString, new Set<I>())
      indexMap.get(keyString)?.add(item.id)
    }

    // Group entries by bucket file name, then persist each bucket
    const buckets: Record<string, Record<string, I[]>[]> = {}
    for (const [rawKeyString, identifierSet] of indexMap) {
      const bucketFileName = await driver.fileNameForIndexKey(rawKeyString)
      if (!buckets[bucketFileName]) buckets[bucketFileName] = []
      buckets[bucketFileName].push({ [rawKeyString]: [...identifierSet] })
    }

    await Promise.all(
      Object.entries(buckets).map(async ([bucketFileName, records]) => {
        const filePath = await driver.joinPath(indexPath, bucketFileName)
        await driver.writeIndexObject(filePath, records)
      }),
    )
  }

  const readIndex = async (fieldPath: string) => {
    const indexPath = await toIndexPathForField(fieldPath)
    const indexExists = await safeFileExists(indexPath)
    if (!indexExists) throw new Error(`Index on field "${fieldPath}" does not exist`)

    const relativeFiles = await driver.listFilesRecursive(indexPath)
    const resultIndex = new Map<string, Set<I>>()

    await Promise.all(
      relativeFiles.map(async (relativePath) => {
        const fullPath = await driver.joinPath(indexPath, relativePath)
        const maps = await driver.readIndexObject(fullPath).catch(() => null)
        if (!Array.isArray(maps)) return
        for (const entry of maps) {
          for (const [rawKey, identifierList] of Object.entries(entry)) {
            if (!resultIndex.has(rawKey)) resultIndex.set(rawKey, new Set<I>())
            const target = resultIndex.get(rawKey)
            for (const identifier of identifierList) target?.add(identifier)
          }
        }
      }),
    )

    return resultIndex
  }

  // Track which field paths should be kept up-to-date incrementally.
  const indicesToMaintain: string[] = []

  const applyIndexDeltas = async (deltas: Map<string, IndexDelta<I>>) => {
    // For each indexed field with changes, touch only the affected bucket files
    await Promise.all(
      [...deltas.entries()].map(async ([fieldPath, delta]) => {
        const indexPath = await toIndexPathForField(fieldPath)
        const indexExists = await safeFileExists(indexPath)
        if (!indexExists) return // Only update indices that exist
        await driver.ensureDir(indexPath)

        // Compute impacted bucket filenames
        const touchedRawKeys = new Set<string>([
          ...delta.adds.keys(),
          ...delta.removes.keys(),
        ])

        const rawKeyToBucketFileName = new Map<string, string>()
        await Promise.all(
          [...touchedRawKeys].map(async (rawKey) => {
            rawKeyToBucketFileName.set(rawKey, await driver.fileNameForIndexKey(rawKey))
          }),
        )

        const touchedBucketFileNames = new Set<string>(rawKeyToBucketFileName.values())

        await Promise.all(
          [...touchedBucketFileNames].map(async (bucketFileName) => {
            const filePath = await driver.joinPath(indexPath, bucketFileName)
            const bucketIndex = await readBucketIndex(filePath)

            // Apply removals for keys that map to this bucket
            delta.removes.forEach((identifierSet, rawKey) => {
              if (rawKeyToBucketFileName.get(rawKey) !== bucketFileName) return
              const setForKey = bucketIndex.get(rawKey)
              if (!setForKey) return
              identifierSet.forEach(identifier => setForKey.delete(identifier))
              if (setForKey.size === 0) bucketIndex.delete(rawKey)
            })

            // Apply additions
            delta.adds.forEach((identifierSet, rawKey) => {
              if (rawKeyToBucketFileName.get(rawKey) !== bucketFileName) return
              const setForKey = bucketIndex.get(rawKey) ?? new Set<I>()
              identifierSet.forEach(identifier => setForKey.add(identifier))
              bucketIndex.set(rawKey, setForKey)
            })

            await writeBucketIndex(filePath, bucketIndex)
          }),
        )
      }),
    )
  }

  const removeIdFromIndex = async (fieldPath: string, identifier: I) => {
    const indexPath = await toIndexPathForField(fieldPath)
    const indexExists = await safeFileExists(indexPath)
    if (!indexExists) return

    const relativeFiles = await driver.listFilesRecursive(indexPath)
    await Promise.all(
      relativeFiles.map(async (relativePath) => {
        const filePath = await driver.joinPath(indexPath, relativePath)
        const data = await driver.readIndexObject(filePath).catch(() => null)
        if (!Array.isArray(data)) return

        let changed = false
        const bucketIndex = new Map<string, Set<I>>()
        for (const entry of data) {
          for (const [rawKey, identifierList] of Object.entries(entry)) {
            const set = new Set<I>(identifierList)
            const before = set.size
            set.delete(identifier)
            if (set.size !== before) changed = true
            if (set.size > 0) bucketIndex.set(rawKey, set)
          }
        }

        if (!changed) return
        await writeBucketIndex(filePath, bucketIndex)
      }),
    )
  }

  const addIdToIndex = async (fieldPath: string, value: any, identifier: I) => {
    if (value == null) return
    const rawKey = String(value)

    const indexPath = await toIndexPathForField(fieldPath)
    const indexExists = await safeFileExists(indexPath)
    if (!indexExists) return
    await driver.ensureDir(indexPath)

    const filePath = await toIndexBucketFilePath(indexPath, rawKey)
    const bucketIndex = await readBucketIndex(filePath)

    const setForKey = bucketIndex.get(rawKey) ?? new Set<I>()
    setForKey.add(identifier)
    bucketIndex.set(rawKey, setForKey)

    await writeBucketIndex(filePath, bucketIndex)
  }

  const updateIndexForReplace = async (oldItem: T, nextItem: T) => {
    await Promise.all(
      indicesToMaintain.map(async (fieldPath) => {
        await removeIdFromIndex(fieldPath, oldItem.id)
        const newValue = get(nextItem, fieldPath)
        await addIdToIndex(fieldPath, newValue, nextItem.id)
      }),
    )
  }

  const upsertItems = async (
    items: T[],
    mode: 'insert' | 'replace',
  ) => {
    const deltas = new Map<string, IndexDelta<I>>()

    await Promise.all(
      items.map(async (item) => {
        const filePath = await toItemsFilePath(item.id)
        const existingArray = await readItemsArrayOrEmpty(filePath)
        const indexOfItem = existingArray.findIndex(existing => existing.id === item.id)

        if (mode === 'insert') {
          if (indexOfItem !== -1) throw new Error(`Item with id "${String(item.id)}" already exists`)
          accumulateUpsertDelta(deltas, indicesToMaintain, undefined, item)
          await driver.writeObject(filePath, [...existingArray, item])
        } else {
          if (indexOfItem === -1) throw new Error(`Item with id "${String(item.id)}" does not exist`)
          const updatedArray = [...existingArray]
          const oldItem = updatedArray[indexOfItem]
          updatedArray[indexOfItem] = item
          await driver.writeObject(filePath, updatedArray)
          await updateIndexForReplace(oldItem, item)
        }
      }),
    )

    // Only apply deltas for inserts (replace handled by direct purge+add)
    if (deltas.size > 0) {
      await applyIndexDeltas(deltas)
    }
  }

  return createStorageAdapter<T, I>({
    setup: async () => {
      await driver.ensureDir(folderName)
    },

    teardown: async () => {
      // no-op
    },

    readAll,

    readIds: async (identifiers) => {
      const results: (T | null)[] = await Promise.all(
        identifiers.map(async (identifier) => {
          const filePath = await toItemsFilePath(identifier)
          const itemsInFile = await driver.readObject(filePath).catch(() => []) ?? []
          if (!Array.isArray(itemsInFile)) return null
          return itemsInFile.find(item => item.id === identifier) ?? null
        }),
      )
      return results.filter((value): value is T => value != null)
    },

    createIndex: async (fieldPath) => {
      if (fieldPath === 'id') throw new Error('Cannot create index on id field')
      indicesToMaintain.push(fieldPath)
      await ensureIndex(fieldPath)
    },

    dropIndex: async (fieldPath) => {
      const pathToDrop = await toIndexPathForField(fieldPath)
      const exists = await safeFileExists(pathToDrop)
      if (!exists) throw new Error(`Index on field "${fieldPath}" does not exist`)
      await driver.removeEntry(pathToDrop, { recursive: true })
    },

    readIndex,

    insert: async (itemsToInsert) => {
      await upsertItems(itemsToInsert, 'insert')
    },

    replace: async (itemsToReplace) => {
      await upsertItems(itemsToReplace, 'replace')
    },

    remove: async (itemsToRemove) => {
      const deltas = new Map<string, IndexDelta<I>>()

      await Promise.all(
        itemsToRemove.map(async (item) => {
          const filePath = await toItemsFilePath(item.id)
          const existingArray = await readItemsArrayOrEmpty(filePath)
          const indexOfItem = existingArray.findIndex(existing => existing.id === item.id)
          if (indexOfItem === -1) throw new Error(`Item with id "${String(item.id)}" does not exist`)

          accumulateRemoveDelta(deltas, indicesToMaintain, existingArray[indexOfItem])

          const updatedArray = [...existingArray]
          updatedArray.splice(indexOfItem, 1)
          await (updatedArray.length === 0
            ? driver.removeEntry(filePath).catch(() => { /* ignore */ })
            : driver.writeObject(filePath, updatedArray))
        }),
      )

      await applyIndexDeltas(deltas)
    },

    removeAll: async () => {
      const exists = await safeFileExists(folderName)
      if (!exists) return
      await driver.removeEntry(folderName, { recursive: true })
    },
  })
}
