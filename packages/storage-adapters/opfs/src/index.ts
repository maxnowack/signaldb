import type { Driver } from '@signaldb/generic-fs'
import createGenericFSAdapter from '@signaldb/generic-fs'
import { serializeValue } from '@signaldb/core'

/**
 * Convert an arbitrary filename into a OPFS safe filename.
 * @param input - The input filename to sanitize.
 * @returns A safe filename.
 */
function toSafeFilename(input: string): string {
  const replacement = '_'

  let name = input.normalize('NFC')

  const escapeRegex = (s: string) => s.replaceAll(/[-/\\^$*+?.()|[\]{}]/g, String.raw`\$&`)
  name = name.replaceAll('/', replacement)
  name = name.replaceAll(new RegExp(`${escapeRegex(replacement)}{2,}`, 'g'), replacement)

  if (!name) name = 'unnamed'

  return name
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

  const ensureDirectoryExists = async (
    rootDirectory: FileSystemDirectoryHandle,
    directoryPath: string,
    createIfMissing = true,
  ) => {
    const parts = directoryPath.split('/').filter(Boolean)
    let current = rootDirectory
    for (const part of parts) {
      current = await current.getDirectoryHandle(part, { create: createIfMissing })
    }
    return current
  }

  const getFileHandleForPath = async (
    rootDirectory: FileSystemDirectoryHandle,
    fullPath: string,
    createIfMissing = true,
  ): Promise<FileSystemFileHandle> => {
    const parts = fullPath.split('/').filter(Boolean)
    const fileName = parts.pop() as string
    const directoryHandle = await ensureDirectoryExists(rootDirectory, parts.join('/'), createIfMissing)
    return directoryHandle.getFileHandle(fileName, { create: createIfMissing })
  }

  const driver: Driver<T, I> = {
    fileNameForId: (id) => {
      if (typeof id !== 'string' && typeof id !== 'number') {
        return Promise.resolve(toSafeFilename(serializeValue(id) as string))
      }
      const idString = typeof id === 'string' ? id : id.toString(16).padStart(4, '0')
      const firstShard = toSafeFilename(idString.slice(0, 2) || '00')
      const secondShard = toSafeFilename(idString.slice(2, 4) || '00')
      return Promise.resolve(`${firstShard}/${secondShard}/${toSafeFilename(idString)}`)
    },
    fileNameForIndexKey: key => Promise.resolve(toSafeFilename(key)),
    joinPath: (...parts) => Promise.resolve(parts.join('/')),
    ensureDir: async (directoryPath) => {
      const rootDirectory = await navigator.storage.getDirectory()
      await ensureDirectoryExists(rootDirectory, directoryPath, true)
    },

    fileExists: async (path) => {
      const rootDirectory = await navigator.storage.getDirectory()
      try {
        await getFileHandleForPath(rootDirectory, path, false)
        return true
      } catch {
        const parts = path.split('/').filter(Boolean)
        let directory = rootDirectory
        for (const part of parts) {
          try {
            directory = await directory.getDirectoryHandle(part)
          } catch {
            return false
          }
        }
        return true
      }
    },

    readObject: async (path) => {
      const rootDirectory = await navigator.storage.getDirectory()
      try {
        const handle = await getFileHandleForPath(rootDirectory, path, false)
        const file = await handle.getFile()
        const text = await file.text()
        return deserialize(text)
      } catch {
        return null
      }
    },

    writeObject: async (path, value) => {
      const rootDirectory = await navigator.storage.getDirectory()
      const handle = await getFileHandleForPath(rootDirectory, path, true)
      const writableStream = await handle.createWritable()
      const text = serialize(value)
      await writableStream.write(text)
      await writableStream.close()
    },

    readIndexObject: async (path) => {
      const rootDirectory = await navigator.storage.getDirectory()
      try {
        const handle = await getFileHandleForPath(rootDirectory, path, false)
        const file = await handle.getFile()
        const text = await file.text()
        return deserialize(text)
      } catch {
        return null
      }
    },

    writeIndexObject: async (path, value) => {
      const rootDirectory = await navigator.storage.getDirectory()
      const handle = await getFileHandleForPath(rootDirectory, path, true)
      const writableStream = await handle.createWritable()
      const text = serialize(value)
      await writableStream.write(text)
      await writableStream.close()
    },

    listFilesRecursive: async (directoryPath) => {
      const rootDirectory = await navigator.storage.getDirectory()
      let directoryHandle: FileSystemDirectoryHandle
      try {
        directoryHandle = await ensureDirectoryExists(rootDirectory, directoryPath, false)
      } catch {
        /* istanbul ignore next -- @preserve */
        return []
      }

      const files: string[] = []
      // @ts-expect-error -- for-await-of on FileSystemDirectoryHandle is not in types yet
      for await (const entry of directoryHandle.values()) {
        if (entry.kind === 'file') {
          files.push(entry.name as string)
        } else if (entry.kind === 'directory') {
          const subFiles = await driver.listFilesRecursive(`${directoryPath}/${entry.name}`)
          files.push(...subFiles.map(f => `${entry.name}/${f}`))
        }
      }
      return files
    },

    removeEntry: async (path, removeOptions) => {
      const rootDirectory = await navigator.storage.getDirectory()
      const pathParts = path.split('/').filter(Boolean)
      const name = pathParts.pop()
      if (!name) throw new Error('Invalid path')
      const parent = pathParts.length > 0
        ? await ensureDirectoryExists(rootDirectory, pathParts.join('/'), false)
        : rootDirectory
      await parent.removeEntry(name, { recursive: Boolean(removeOptions?.recursive) })
    },
  }
  return createGenericFSAdapter<T, I>(driver, folderName)
}
