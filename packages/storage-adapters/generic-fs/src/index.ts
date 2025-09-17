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
      const itemsInFile = await driver.readObject(fullPath).catch(() => null)
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
        const maps = await driver.readIndexObject(fullPath).catch(() => null)
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

  type IndexDelta = {
    adds: Map<string, Set<I>>,
    removes: Map<string, Set<I>>,
  }

  const addToDelta = (
    deltas: Map<string, IndexDelta>,
    field: string,
    kind: 'add' | 'remove',
    rawKey: string,
    id: I,
  ) => {
    if (!deltas.has(field)) deltas.set(field, { adds: new Map(), removes: new Map() })
    const delta = deltas.get(field)
    if (!delta) return
    const target = kind === 'add' ? delta.adds : delta.removes
    if (!target.has(rawKey)) target.set(rawKey, new Set<I>())
    target.get(rawKey)?.add(id)
  }

  const addDeltaForChange = (
    deltas: Map<string, IndexDelta>,
    field: string,
    oldValue: any,
    newValue: any,
    id: I,
  ) => {
    const oldKey = oldValue == null ? undefined : String(oldValue)
    const newKey = newValue == null ? undefined : String(newValue)
    if (oldKey === newKey) return
    if (oldKey != null) addToDelta(deltas, field, 'remove', oldKey, id)
    if (newKey != null) addToDelta(deltas, field, 'add', newKey, id)
  }

  const accumulateUpsertDelta = (
    deltas: Map<string, IndexDelta>,
    existing: T | undefined,
    next: T,
  ) => {
    if (existing) {
      for (const field of indicesToMaintain) {
        addDeltaForChange(deltas, field, get(existing, field), get(next, field), next.id)
      }
    } else {
      for (const field of indicesToMaintain) {
        const value = get(next, field)
        if (value == null) continue
        addToDelta(deltas, field, 'add', String(value), next.id)
      }
    }
  }

  const accumulateRemoveDelta = (
    deltas: Map<string, IndexDelta>,
    existing: T,
  ) => {
    for (const field of indicesToMaintain) {
      const value = get(existing, field)
      if (value == null) continue
      addToDelta(deltas, field, 'remove', String(value), existing.id)
    }
  }

  const applyIndexDeltas = async (deltas: Map<string, IndexDelta>) => {
    // For each indexed field with changes, touch only the affected bucket files
    await Promise.all(
      [...deltas.entries()].map(async ([fieldPath, delta]) => {
        const indexPath = await driver.joinPath(
          await indexRootPathPromise,
          await driver.fileNameForIndexKey(fieldPath),
        )
        const indexExists = await driver.fileExists(indexPath).catch(() => false)
        if (!indexExists) return // Only update indices that exist
        await driver.ensureDir(indexPath)

        // Compute impacted bucket filenames
        const touchedRawKeys = new Set<string>([
          ...delta.adds.keys(),
          ...delta.removes.keys(),
        ])

        const rawKeyToBucket = new Map<string, string>()
        await Promise.all(
          [...touchedRawKeys].map(async (rawKey) => {
            rawKeyToBucket.set(rawKey, await driver.fileNameForIndexKey(rawKey))
          }),
        )
        const touchedBuckets = new Set<string>(rawKeyToBucket.values())

        await Promise.all(
          [...touchedBuckets].map(async (bucket) => {
            const filePath = await driver.joinPath(indexPath, bucket)
            const data = await driver.readIndexObject(filePath).catch(() => null)

            // Rehydrate only this bucket into a map of rawKey -> Set<I>
            const bucketIndex = new Map<string, Set<I>>()
            if (Array.isArray(data)) {
              for (const entry of data) {
                for (const [rawKey, ids] of Object.entries(entry)) {
                  bucketIndex.set(rawKey, new Set(ids))
                }
              }
            }

            // Apply removals for keys that map to this bucket
            delta.removes.forEach((ids, rawKey) => {
              if (rawKeyToBucket.get(rawKey) !== bucket) return
              const set = bucketIndex.get(rawKey)
              if (!set) return
              ids.forEach(id => set.delete(id))
              if (set.size === 0) bucketIndex.delete(rawKey)
            })

            // Apply additions
            delta.adds.forEach((ids, rawKey) => {
              if (rawKeyToBucket.get(rawKey) !== bucket) return
              let set = bucketIndex.get(rawKey)
              if (!set) {
                set = new Set<I>()
                bucketIndex.set(rawKey, set)
              }
              ids.forEach(id => set.add(id))
            })

            if (bucketIndex.size === 0) {
              const exists = await driver.fileExists(filePath).catch(() => false)
              if (exists) await driver.removeEntry(filePath).catch(() => { /* ignore */ })
              return
            }

            // Persist this bucket only
            const out: Record<string, I[]>[] = []
            bucketIndex.forEach((set, rawKey) => {
              out.push({ [rawKey]: [...set] as I[] })
            })
            await driver.writeIndexObject(filePath, out)
          }),
        )
      }),
    )
  }

  // Shared item operations using the delta helpers
  const upsertItems = async (
    items: T[],
    mode: 'insert' | 'replace',
  ) => {
    const deltas = new Map<string, IndexDelta>()

    await Promise.all(
      items.map(async (item) => {
        const filePath = await driver.joinPath(
          await itemsDirectoryPathPromise,
          await driver.fileNameForId(item.id),
        )
        const existing = await driver.fileExists(filePath)
          ? (await driver.readObject(filePath).catch(() => [])) ?? []
          : []
        const index = existing.findIndex(x => x.id === item.id)

        if (mode === 'insert') {
          if (index !== -1) throw new Error(`Item with id "${String(item.id)}" already exists`)
          accumulateUpsertDelta(deltas, undefined, item)
          await driver.writeObject(filePath, [...existing, item])
        } else {
          if (index === -1) throw new Error(`Item with id "${String(item.id)}" does not exist`)
          accumulateUpsertDelta(deltas, existing[index], item)
          const updated = [...existing]
          updated[index] = item
          await driver.writeObject(filePath, updated)
        }
      }),
    )

    await applyIndexDeltas(deltas)
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
        const itemsInFile = (await driver.readObject(filePath).catch(() => [])) ?? []
        if (!Array.isArray(itemsInFile)) return null
        return itemsInFile.find(item => item.id === identifier) ?? null
      }))
      return results.filter((value): value is T => value != null)
    },

    createIndex: async (fieldPath) => {
      if (fieldPath === 'id') throw new Error('Cannot create index on id field')
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
      await upsertItems(itemsToInsert, 'insert')
    },

    replace: async (itemsToReplace) => {
      await upsertItems(itemsToReplace, 'replace')
    },

    remove: async (itemsToRemove) => {
      const deltas = new Map<string, IndexDelta>()

      await Promise.all(
        itemsToRemove.map(async (item) => {
          const filePath = await driver.joinPath(
            await itemsDirectoryPathPromise,
            await driver.fileNameForId(item.id),
          )
          const existing = await driver.fileExists(filePath)
            ? await driver.readObject(filePath).catch(() => []) ?? []
            : []
          const array = Array.isArray(existing) ? existing : []
          const index = array.findIndex(x => x.id === item.id)
          if (index === -1) throw new Error(`Item with id "${String(item.id)}" does not exist`)

          accumulateRemoveDelta(deltas, array[index])

          const updated = [...array]
          updated.splice(index, 1)
          await (updated.length === 0
            ? driver.removeEntry(filePath)
            : driver.writeObject(filePath, updated))
        }),
      )

      await applyIndexDeltas(deltas)
    },

    removeAll: async () => {
      const exists = await driver.fileExists(folderName).catch(() => false)
      if (!exists) return
      await driver.removeEntry(folderName, { recursive: true })
    },
  })
}
