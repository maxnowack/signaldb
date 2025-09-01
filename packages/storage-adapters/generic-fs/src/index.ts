import { createStorageAdapter, get } from '@signaldb/core'

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

  const readAll = async (): Promise<T[]> => {
    const directoryExists = await driver.fileExists(await itemsDirectoryPathPromise)
      .catch(() => false)
    if (!directoryExists) return []

    const relativeFiles = await driver.listFilesRecursive(await itemsDirectoryPathPromise)
    const aggregatedItems: T[] = []

    await Promise.all(relativeFiles.map(async (relativePath) => {
      const fullPath = await driver.joinPath(await itemsDirectoryPathPromise, relativePath)
      const itemsInFile = await driver.readObject(fullPath)
      if (!Array.isArray(itemsInFile)) return
      aggregatedItems.push(...itemsInFile)
    }))

    return aggregatedItems
  }

  const ensureIndex = async (
    fieldPath: string,
    itemsPromise: Promise<T[]> = readAll(),
  ): Promise<void> => {
    const allItems = await itemsPromise
    const indexPath = await driver.joinPath(
      await indexRootPathPromise,
      await driver.fileNameForIndexKey(fieldPath),
    )
    await driver.removeEntry(indexPath, { recursive: true }).catch(() => { /* ignore */ })
    await driver.ensureDir(indexPath)

    // Map<fieldValue, Set<identifier>>
    const indexMap = new Map<unknown, Set<I>>()
    for (const item of allItems) {
      const fieldValue = get(item, fieldPath)
      if (fieldValue == null) continue
      if (!indexMap.has(fieldValue)) indexMap.set(fieldValue, new Set<I>())
      indexMap.get(fieldValue)?.add(item.id)
    }

    // Persist as files keyed by safe value; keep original value stringified for lookup parity.
    const buckets: Record<string, Record<string, I[]>[]> = {}
    for (const [rawKey, identifiers] of indexMap) {
      const rawKeyString = String(rawKey)
      const key = await driver.fileNameForIndexKey(rawKeyString)
      if (!buckets[key]) buckets[key] = []
      buckets[key].push({ [rawKeyString]: [...identifiers] })
    }

    await Promise.all(
      Object.entries(buckets).map(async ([key, maps]) => {
        const filePath = await driver.joinPath(indexPath, key)
        await driver.writeIndexObject(filePath, maps)
      }),
    )
  }

  const readIndex = async (fieldPath: string) => {
    const indexPath = await driver.joinPath(
      await indexRootPathPromise,
      await driver.fileNameForIndexKey(fieldPath),
    )
    const indexExists = await driver.fileExists(indexPath).catch(() => false)
    if (!indexExists) throw new Error(`Index on field "${fieldPath}" does not exist`)

    const relativeFiles = await driver.listFilesRecursive(indexPath)
    const resultIndex = new Map<string, Set<I>>()

    await Promise.all(
      relativeFiles.map(async (relativePath) => {
        const fullPath = await driver.joinPath(indexPath, relativePath)
        const maps = await driver.readIndexObject(fullPath)
        if (!Array.isArray(maps)) return
        for (const entry of maps) {
          for (const [key, identifiers] of Object.entries(entry)) {
            if (!resultIndex.has(key)) resultIndex.set(key, new Set<I>())
            for (const identifier of identifiers) {
              resultIndex.get(key)?.add(identifier)
            }
          }
        }
      }),
    )

    return resultIndex
  }

  const indicesToMaintain: string[] = []

  const updateAllIndices = async () => {
    const allItemsPromise = readAll()
    await Promise.all(indicesToMaintain.map(field => ensureIndex(field, allItemsPromise)))
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
      const results: (T | null)[] = await Promise.all(identifiers.map(async (identifier) => {
        const filePath = await driver.joinPath(
          await itemsDirectoryPathPromise,
          await driver.fileNameForId(identifier),
        )
        const itemsInFile = await driver.readObject(filePath)
        if (!Array.isArray(itemsInFile)) return null
        return itemsInFile.find(item => item.id === identifier) ?? null
      }))
      return results.filter((value): value is T => value != null)
    },

    createIndex: async (fieldPath) => {
      indicesToMaintain.push(fieldPath)
      await ensureIndex(fieldPath)
    },

    dropIndex: async (fieldPath) => {
      const pathToDrop = await driver.joinPath(
        await indexRootPathPromise,
        await driver.fileNameForIndexKey(fieldPath),
      )
      const exists = await driver.fileExists(pathToDrop).catch(() => false)
      if (!exists) throw new Error(`Index on field "${fieldPath}" does not exist`)
      await driver.removeEntry(pathToDrop, { recursive: true })
    },

    readIndex,

    insert: async (itemsToInsert) => {
      await Promise.all(
        itemsToInsert.map(async (item) => {
          const filePath = await driver.joinPath(
            await itemsDirectoryPathPromise,
            await driver.fileNameForId(item.id),
          )
          const existing = await driver.readObject(filePath)
          const existingItems = Array.isArray(existing) ? existing : []
          if (existingItems.some(existingItem => existingItem.id === item.id)) {
            throw new Error(`Item with id "${String(item.id)}" already exists`)
          }
          const updatedItems = [...existingItems, item]
          await driver.writeObject(filePath, updatedItems)
          await updateAllIndices()
        }),
      )
    },

    replace: async (itemsToReplace) => {
      await Promise.all(
        itemsToReplace.map(async (item) => {
          const filePath = await driver.joinPath(
            await itemsDirectoryPathPromise,
            await driver.fileNameForId(item.id),
          )
          const existing = await driver.readObject(filePath)
          const existingItems = Array.isArray(existing) ? existing : []
          const foundIndex = existingItems.findIndex(existingItem => existingItem.id === item.id)
          if (foundIndex === -1) {
            throw new Error(`Item with id "${String(item.id)}" does not exist`)
          }
          const updatedItems = [...existingItems]
          updatedItems[foundIndex] = item
          await driver.writeObject(filePath, updatedItems)
        }),
      )
      await updateAllIndices()
    },

    remove: async (itemsToRemove) => {
      await Promise.all(
        itemsToRemove.map(async (item) => {
          const filePath = await driver.joinPath(
            await itemsDirectoryPathPromise,
            await driver.fileNameForId(item.id),
          )
          const existing = await driver.readObject(filePath)
          const existingItems = Array.isArray(existing) ? existing : []
          const foundIndex = existingItems.findIndex(existingItem => existingItem.id === item.id)
          if (foundIndex === -1) {
            throw new Error(`Item with id "${String(item.id)}" does not exist`)
          }
          const updatedItems = [...existingItems]
          updatedItems.splice(foundIndex, 1)
          await (updatedItems.length === 0
            ? driver.removeEntry(filePath)
            : driver.writeObject(filePath, updatedItems))
        }),
      )
      await updateAllIndices()
    },

    removeAll: async () => {
      const exists = await driver.fileExists(folderName).catch(() => false)
      if (!exists) return
      await driver.removeEntry(folderName, { recursive: true })
    },
  })
}
