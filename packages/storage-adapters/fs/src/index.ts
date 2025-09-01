import { serializeValue } from '@signaldb/core'
import type { Driver } from '@signaldb/generic-fs'
import createGenericFSAdapter from '@signaldb/generic-fs'

/**
 * Convert an arbitrary filename into a cross-platform safe filename.
 * - Replaces unsafe chars: <>:"/\|?* and control chars (0x00–0x1F, 0x7F)
 * - Trims trailing spaces/dots (illegal on Windows)
 * - Avoids reserved Windows basenames (CON, PRN, AUX, NUL, COM1–9, LPT1–9)
 * - Preserves file extension and enforces a max length (default 255)
 * @param input - The input filename to sanitize.
 * @returns A safe filename.
 */
function toSafeFilename(input: string): string {
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
 * Creates a persistence adapter for managing a SignalDB collection backed by a filesystem.
 * This adapter reads and writes data to a file, providing serialization and deserialization options.
 * @template T - The type of the items in the collection.
 * @template I - The type of the unique identifier for the items.
 * @param folderName - The name of the file to read/write data from/to.
 * @param options - Optional configuration for serialization and deserialization.
 * @param options.serialize - A function to serialize items to a string (default: `JSON.stringify`).
 * @param options.deserialize - A function to deserialize a string into items (default: `JSON.parse`).
 * @returns A SignalDB persistence adapter for managing data in the filesystem.
 * @example
 * import createFilesystemAdapter from './createFilesystemAdapter';
 *
 * const adapter = createFilesystemAdapter('data.json', {
 *   serialize: (items) => JSON.stringify(items, null, 2), // Pretty-print JSON
 *   deserialize: (itemsString) => JSON.parse(itemsString), // Default JSON parse
 * });
 *
 * const collection = new Collection({
 *   persistence: adapter,
 * });
 *
 * // Perform operations on the collection, and changes will be reflected in the file.
 */
export default function createFilesystemAdapter<
  T extends { id: I } & Record<string, unknown>,
  I,
>(
  folderName: string,
  options?: {
    serialize?: (data: any) => string,
    deserialize?: (input: string) => any,
  },
) {
  const serialize = options?.serialize || (data => JSON.stringify(data))
  const deserialize = options?.deserialize || (input => JSON.parse(input))

  const fsPromise = import('fs')
  // eslint-disable-next-line unicorn/import-style
  const pathPromise = import('path')

  const driver: Driver<T, I> = {
    fileNameForId: async (id) => {
      const path = await pathPromise
      if (typeof id !== 'string' && typeof id !== 'number') return toSafeFilename(serializeValue(id) as string)
      const idString = typeof id === 'string' ? id : id.toString(16).padStart(4, '0')
      const firstShard = toSafeFilename(idString.slice(0, 2) || '00')
      const secondShard = toSafeFilename(idString.slice(2, 4) || '00')
      return path.join(firstShard, secondShard, toSafeFilename(idString)) // e.g. "ab/cd/abcdef123456..."
    },
    fileNameForIndexKey: key => Promise.resolve(toSafeFilename(key)),
    joinPath: async (...parts) => {
      const path = await pathPromise
      return path.join(...parts)
    },
    ensureDir: async (directoryPath: string) => {
      const fs = await fsPromise
      await fs.promises.mkdir(directoryPath, { recursive: true })
    },

    fileExists: async (filePath) => {
      const fs = await fsPromise
      try {
        await fs.promises.access(filePath)
        return true
      } catch {
        return false
      }
    },

    readObject: async (filePath) => {
      const fs = await fsPromise
      try {
        const text = await fs.promises.readFile(filePath, 'utf8')
        return deserialize(text)
      } catch {
        return null
      }
    },

    writeObject: async (filePath, value) => {
      const [fs, path] = await Promise.all([
        fsPromise,
        pathPromise,
      ])
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      const text = serialize(value)
      await fs.promises.writeFile(filePath, text)
    },

    readIndexObject: async (filePath) => {
      const fs = await fsPromise
      try {
        const text = await fs.promises.readFile(filePath, 'utf8')
        return deserialize(text)
      } catch {
        return null
      }
    },

    writeIndexObject: async (filePath, value) => {
      const [fs, path] = await Promise.all([
        fsPromise,
        pathPromise,
      ])
      await fs.promises.mkdir(path.dirname(filePath), { recursive: true })
      const text = serialize(value)
      await fs.promises.writeFile(filePath, text)
    },

    listFilesRecursive: async (directoryPath: string): Promise<string[]> => {
      const [fs, path] = await Promise.all([
        fsPromise,
        pathPromise,
      ])

      const collectedRelativePaths: string[] = []

      const walk = async (absoluteBasePath: string, relativeBasePath: string): Promise<void> => {
        let entryNames: string[]
        try {
          entryNames = await fs.promises.readdir(absoluteBasePath)
        } catch {
          return
        }

        await Promise.all(
          entryNames.map(async (entryName) => {
            const absoluteEntryPath = path.join(absoluteBasePath, entryName)
            const statistics = await fs.promises.stat(absoluteEntryPath)
            if (statistics.isDirectory()) {
              const childRelativePath = relativeBasePath ? `${relativeBasePath}/${entryName}` : entryName
              await walk(absoluteEntryPath, childRelativePath)
            } else if (statistics.isFile()) {
              const relativePath = relativeBasePath ? `${relativeBasePath}/${entryName}` : entryName
              collectedRelativePaths.push(relativePath)
            }
          }),
        )
      }

      await walk(directoryPath, '')
      return collectedRelativePaths
    },

    removeEntry: async (path: string, removeOptions?: { recursive?: boolean }): Promise<void> => {
      const fs = await fsPromise
      const recursive = removeOptions?.recursive ?? false
      await fs.promises.rm(path, { recursive, force: true })
    },
  }
  return createGenericFSAdapter<T, I>(driver, folderName)
}
