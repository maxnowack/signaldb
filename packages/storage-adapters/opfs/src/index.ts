import { createStorageAdapter, get, serializeValue } from '@signaldb/core'

/**
 * Convert an arbitrary filename into a cross-platform safe filename.
 * - Replaces unsafe chars: <>:"/\|?* and control chars (0x00–0x1F, 0x7F)
 * - Trims trailing spaces/dots (illegal on Windows)
 * - Avoids reserved Windows basenames (CON, PRN, AUX, NUL, COM1–9, LPT1–9)
 * - Preserves file extension and enforces a max length (default 255)
 * @param input - The input filename to sanitize.
 * @returns A safe filename.
 */
export function toSafeFilename(input: string): string {
  const replacement = '_'
  const max = 255

  const escapeRegex = (s: string) => s.replaceAll(/[-/\\^$*+?.()|[\]{}]/g, String.raw`\$&`)
  // eslint-disable-next-line no-control-regex
  const INVALID = /[<>:"/\\|?*\u0000-\u001F\u007F]/g // common cross-platform "bad" chars

  // 1) Normalize Unicode (helps avoid odd combining forms)
  let name = input.normalize('NFC')

  // 2) Replace invalid characters; collapse repeats of the replacement
  name = name.replaceAll(INVALID, replacement)
  name = name.replaceAll(new RegExp(`${escapeRegex(replacement)}{2,}`, 'g'), replacement)

  // 3) Trim whitespace and remove trailing dots/spaces (Windows)
  name = name.trim().replaceAll(/[. ]+$/g, '')

  // 4) Fallback if empty
  if (!name) name = 'unnamed'

  // 5) Avoid reserved device names on Windows (even with extensions)
  const base = name.split('.')[0] // check the stem
  if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(base)) {
    name = `_${name}`
  }

  // 6) Enforce max length, preserving extension when possible
  if (name.length > max) {
    const dot = name.lastIndexOf('.')
    if (dot > 0 && dot < name.length - 1) {
      const extension = name.slice(dot)
      const keep = Math.max(1, max - extension.length)
      name = name.slice(0, keep).replaceAll(/[. ]+$/g, '') + extension
    } else {
      name = name.slice(0, max).replaceAll(/[. ]+$/g, '')
    }
    if (!name) name = 'unnamed'
  }

  return name
}

/**
 * Get the root directory handle for the Origin Private File System (OPFS).
 * @returns A promise that resolves to the root directory handle.
 */
async function getRoot() {
  return navigator.storage.getDirectory()
}

/**
 * Ensures that a directory exists at the specified path within the given root directory.
 * @param root The root directory handle.
 * @param path The path of the directory to ensure, relative to the root.
 * @param create Whether to create the directory if it does not exist (default: true).
 * @returns A promise that resolves to the directory handle of the ensured directory.
 */
async function ensureDirectory(
  root: FileSystemDirectoryHandle,
  path: string,
  create = true,
): Promise<FileSystemDirectoryHandle> {
  const parts = path.split('/').filter(Boolean)
  let directory = root
  for (const part of parts) {
    directory = await directory.getDirectoryHandle(part, { create })
  }
  return directory
}

/**
 * Gets a file handle for the specified full path within the given root directory.
 * @param root The root directory handle.
 * @param fullPath The full path of the file, relative to the root.
 * @param create Whether to create the file if it does not exist (default: true).
 * @returns A promise that resolves to the file handle of the specified file.
 */
async function getFileHandle(
  root: FileSystemDirectoryHandle,
  fullPath: string,
  create = true,
): Promise<FileSystemFileHandle> {
  const parts = fullPath.split('/').filter(Boolean)
  const fileName = parts.pop() as string
  const directory = await ensureDirectory(root, parts.join('/'), create)
  return directory.getFileHandle(fileName, { create })
}

/**
 * Checks if a file exists at the specified full path within the given root directory.
 * @param root The root directory handle.
 * @param fullPath The full path of the file, relative to the root.
 * @returns A promise that resolves to true if the file exists, false otherwise.
 */
async function fileExists(root: FileSystemDirectoryHandle, fullPath: string): Promise<boolean> {
  try {
    const handle = await getFileHandle(root, fullPath, false)
    void handle // avoid ts complaint
    return true
  } catch {
    return false
  }
}

/**
 * Recursively removes an entry (file or directory) at the specified full path within the given root directory.
 * @param root The root directory handle.
 * @param fullPath The full path of the entry to remove, relative to the root.
 */
async function removeEntryRecursive(root: FileSystemDirectoryHandle, fullPath: string) {
  const parts = fullPath.split('/').filter(Boolean)
  const name = parts.pop()
  const parent = await ensureDirectory(root, parts.join('/'), false)
  await parent.removeEntry(name as string, { recursive: true })
}

/**
 * Recursively walks through all files in the given directory and its subdirectories.
 * @param directory The directory handle to start walking from.
 * @yields File handles for each file found.
 */
async function* walkFiles(
  directory: FileSystemDirectoryHandle,
): AsyncGenerator<FileSystemFileHandle> {
  // for-await is supported on directory handle
  // @ts-expect-error: lib.dom type may not include iterable entries in some ts versions
  for await (const entry of directory.values()) {
    if (entry.kind === 'file') {
      yield entry as FileSystemFileHandle
    } else if (entry.kind === 'directory') {
      yield* walkFiles(entry as FileSystemDirectoryHandle)
    }
  }
}

/**
 * Creates a persistence adapter for managing a SignalDB collection using the
 * Origin Private File System (OPFS). This adapter allows data to be stored and managed
 * directly in the browser's file system with support for customizable serialization
 * and deserialization.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param folderName - The name of the file in OPFS where data will be stored.
 * @param options - Optional configuration for serialization and deserialization.
 * @param options.serialize - A function to serialize items to a string (default: `JSON.stringify`).
 * @param options.deserialize - A function to deserialize a string into items (default: `JSON.parse`).
 * @returns A SignalDB persistence adapter for managing data in OPFS.
 * @example
 * import createOPFSAdapter from './createOPFSAdapter';
 * import { Collection } from '@signaldb/core';
 *
 * const adapter = createOPFSAdapter('myCollection.json', {
 *   serialize: (items) => JSON.stringify(items, null, 2), // Pretty-print JSON
 *   deserialize: (itemsString) => JSON.parse(itemsString), // Default JSON parse
 * });
 *
 * const collection = new Collection({
 *   persistence: adapter,
 * });
 *
 * // Perform operations on the collection, and changes will be reflected in the OPFS file.
 */
export default function createOPFSAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(
  folderName: string,
  options?: {
    serialize?: (data: any) => string,
    deserialize?: (input: string) => any,
  },
) {
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options || {}
  const indices: string[] = []

  const sharded = (id: I) => {
    if (typeof id !== 'string' && typeof id !== 'number') return toSafeFilename(serializeValue(id) as string)
    const idString = typeof id === 'string' ? id : id.toString(16).padStart(4, '0')
    const firstShard = toSafeFilename(idString.slice(0, 2) || '00')
    const secondShard = toSafeFilename(idString.slice(2, 4) || '00')
    return `${firstShard}/${secondShard}/${toSafeFilename(idString)}`
  }

  const readAll = async () => {
    const root = await getRoot()
    let itemsDirectory: FileSystemDirectoryHandle
    try {
      itemsDirectory = await ensureDirectory(root, `${folderName}/items`, false)
    } catch {
      return []
    }
    const items: T[] = []
    for await (const fileHandle of walkFiles(itemsDirectory)) {
      const file = await fileHandle.getFile()
      const content = await file.text()
      if (!content) continue
      const itemsInFile = deserialize(content) as T[]
      items.push(...itemsInFile)
    }
    return items
  }

  const ensureIndex = async (field: string, getItems = readAll()) => {
    const items = await getItems
    const root = await getRoot()
    const indexFolderPath = `${folderName}/index/${toSafeFilename(field)}`

    const index = new Map<any, Set<I>>()
    items.forEach((item) => {
      const fieldValue = get(item, field)
      if (fieldValue == null) return
      if (!index.has(fieldValue)) index.set(fieldValue, new Set())
      index.get(fieldValue)?.add(item.id)
    })

    const safeIndex: Record<string, Record<any, I[]>[]> = {}
    index.forEach((ids, key) => {
      const safeKey = toSafeFilename(serializeValue(key) as string)
      if (!safeIndex[safeKey]) safeIndex[safeKey] = []
      safeIndex[safeKey].push({ [key]: [...ids] })
    })

    await Promise.all(Object.entries(safeIndex).map(async ([safeKey, maps]) => {
      const handle = await getFileHandle(root, `${indexFolderPath}/${safeKey}`, true)
      const writable = await handle.createWritable()
      await writable.write(serialize(maps))
      await writable.close()
    }))
  }

  const readIndex = async (field: string) => {
    const root = await getRoot()
    let indexDirectory: FileSystemDirectoryHandle
    try {
      indexDirectory = await ensureDirectory(root, `${folderName}/index/${toSafeFilename(field)}`, false)
    } catch {
      throw new Error(`Index on field "${field}" does not exist`)
    }

    const index = new Map<any, Set<I>>()
    for await (const fileHandle of walkFiles(indexDirectory)) {
      const file = await fileHandle.getFile()
      const content = await file.text()
      if (!content) continue
      const maps = deserialize(content) as Record<any, I[]>[]
      maps.forEach(map => Object.entries(map).forEach(([key, ids]) => {
        if (!index.has(key)) index.set(key, new Set())
        ids.forEach(id => index.get(key)?.add(id))
      }))
    }
    return index
  }

  const updateAllIndices = async () => {
    const allItemsPromise = readAll()
    await Promise.all(indices.map(index => ensureIndex(index, allItemsPromise)))
  }

  return createStorageAdapter<T, I>({
    setup: async () => {
      const root = await getRoot()
      await ensureDirectory(root, folderName, true)
    },
    teardown: async () => {
      // no-op
    },

    readAll,
    readIds: async (ids) => {
      const root = await getRoot()
      const items: (T | null)[] = await Promise.all(ids.map(async (id) => {
        const itemPath = `${folderName}/items/${sharded(id)}`
        const exists = await fileExists(root, itemPath)
        if (!exists) return null
        const handle = await getFileHandle(root, itemPath, false)
        const file = await handle.getFile()
        const content = await file.text()
        if (!content) return null
        const itemsInFile = deserialize(content) as T[]
        return itemsInFile.find(i => i.id === id) || null
      }))
      return items.filter((i): i is T => i != null)
    },

    createIndex: async (field) => {
      indices.push(field)
      await ensureIndex(field)
    },
    dropIndex: async (field) => {
      const root = await getRoot()
      try {
        await removeEntryRecursive(root, `${folderName}/index/${toSafeFilename(field)}`)
      } catch {
        throw new Error(`Index on field "${field}" does not exist`)
      }
    },
    readIndex,

    insert: async (items) => {
      const root = await getRoot()
      await Promise.all(items.map(async (item) => {
        const itemPath = `${folderName}/items/${sharded(item.id)}`
        const handle = await getFileHandle(root, itemPath, true)
        const existingText = await handle.getFile().then(f => f.text()).catch(() => '')
        const existing = existingText ? (deserialize(existingText) as T[]) : []
        if (existing.some(i => i.id === item.id)) {
          throw new Error(`Item with id "${item.id as string}" already exists`)
        }
        existing.push(item)
        const writable = await handle.createWritable()
        await writable.write(serialize(existing))
        await writable.close()
        await updateAllIndices()
      }))
    },
    replace: async (itemsToReplace) => {
      const root = await getRoot()
      await Promise.all(itemsToReplace.map(async (item) => {
        const itemPath = `${folderName}/items/${sharded(item.id)}`
        const handle = await getFileHandle(root, itemPath, true)
        const existingText = await handle.getFile().then(f => f.text()).catch(() => '')
        const existing = existingText ? (deserialize(existingText) as T[]) : []
        const index = existing.findIndex(i => i.id === item.id)
        if (index === -1) {
          throw new Error(`Item with id "${item.id as string}" does not exist`)
        }
        existing[index] = item
        const writable = await handle.createWritable()
        await writable.write(serialize(existing))
        await writable.close()
      }))
      await updateAllIndices()
    },
    remove: async (itemsToRemove) => {
      const root = await getRoot()
      await Promise.all(itemsToRemove.map(async (item) => {
        const itemPath = `${folderName}/items/${sharded(item.id)}`
        const exists = await fileExists(root, itemPath)
        if (!exists) {
          throw new Error(`Item with id "${item.id as string}" does not exist`)
        }
        const handle = await getFileHandle(root, itemPath, false)
        const existingText = await handle.getFile().then(f => f.text()).catch(() => '')
        const existing = existingText ? (deserialize(existingText) as T[]) : []
        const index = existing.findIndex(i => i.id === item.id)
        if (index === -1) {
          throw new Error(`Item with id "${item.id as string}" does not exist`)
        }
        existing.splice(index, 1)
        if (existing.length === 0) {
          // delete the file entirely
          const parts = (`${folderName}/items/${sharded(item.id)}`).split('/').filter(Boolean)
          const fileName = parts.pop() as string
          const parent = await ensureDirectory(root, parts.join('/'), false)
          await parent.removeEntry(fileName)
          return
        }
        const writable = await handle.createWritable()
        await writable.write(serialize(existing))
        await writable.close()
      }))
      await updateAllIndices()
    },
    removeAll: async () => {
      const root = await getRoot()
      try {
        await removeEntryRecursive(root, folderName)
      } catch {
        // ignore if folder does not exist
      }
    },
  })
}
