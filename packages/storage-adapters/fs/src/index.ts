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
  T extends { id: I } & Record<string, any>,
  I,
>(
  folderName: string,
  options?: {
    serialize?: (data: any) => string,
    deserialize?: (input: string) => any,
  },
) {
  // eslint-disable-next-line unicorn/import-style
  const pathPromise = import('node:path')
  const fsPromise = import('node:fs').then(fs => fs.promises)
  const { serialize = JSON.stringify, deserialize = JSON.parse } = options || {}

  const indices: string[] = []

  const sharded = (id: I) => {
    if (typeof id !== 'string' && typeof id !== 'number') return toSafeFilename(serializeValue(id) as string)
    const idString = typeof id === 'string' ? id : id.toString(16).padStart(4, '0')
    const firstShard = toSafeFilename(idString.slice(0, 2) || '00')
    const secondShard = toSafeFilename(idString.slice(2, 4) || '00')
    return `${firstShard}/${secondShard}/${toSafeFilename(idString)}` // e.g. "ab/cd/abcdef123456..."
  }

  const readAll = async () => {
    const [fs, path] = await Promise.all([fsPromise, pathPromise])
    const itemsFolder = path.join(folderName, 'items')
    const exists = await fs.access(itemsFolder).then(() => true).catch(() => false)
    if (!exists) return []

    const files = await fs.readdir(itemsFolder, { recursive: true })
    const items: T[] = []
    await Promise.all(files.map(async (file) => {
      const filePath = path.join(itemsFolder, file)
      const stat = await fs.stat(filePath)
      if (!stat.isFile()) return

      const content = await fs.readFile(filePath, 'utf8')
      const itemsInFile = deserialize(content) as T[]
      items.push(...itemsInFile)
    }))
    return items
  }
  const ensureIndex = async (field: string, getItems = readAll()) => {
    const items = await getItems
    const [fs, path] = await Promise.all([fsPromise, pathPromise])
    const indexFolder = path.join(folderName, 'index', toSafeFilename(field))

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
      const indexFile = path.join(indexFolder, safeKey)
      await fs.mkdir(path.dirname(indexFile), { recursive: true })
      await fs.writeFile(indexFile, serialize(maps))
    }))
  }
  const readIndex = async (field: string) => {
    const [fs, path] = await Promise.all([fsPromise, pathPromise])
    const indexFolder = path.join(folderName, 'index', toSafeFilename(field))
    const exists = await fs.access(indexFolder).then(() => true).catch(() => false)
    if (!exists) throw new Error(`Index on field "${field}" does not exist`)

    const files = await fs.readdir(indexFolder, { recursive: true })
    const index = new Map<any, Set<I>>()
    await Promise.all(files.map(async (file) => {
      const content = await fs.readFile(path.join(indexFolder, file), 'utf8')
      const maps = deserialize(content) as Record<any, I[]>[]
      maps.forEach(map => Object.entries(map).forEach(([key, ids]) => {
        if (!index.has(key)) index.set(key, new Set())
        ids.forEach(id => index.get(key)?.add(id))
      }))
    }))
    return index
  }
  const updateAllIndices = async () => {
    const allItemsPromise = readAll()
    await Promise.all(indices.map(index => ensureIndex(index, allItemsPromise)))
  }

  return createStorageAdapter<T, I>({
    setup: async () => {
      const fs = await fsPromise
      await fs.mkdir(folderName, { recursive: true })
    },
    teardown: async () => {
      // no-op
    },

    readAll,
    readIds: async (ids) => {
      const [fs, path] = await Promise.all([fsPromise, pathPromise])
      const itemsFolder = path.join(folderName, 'items')
      const exists = await fs.access(itemsFolder).then(() => true).catch(() => false)
      if (!exists) return []

      const items = await Promise.all(ids.map(async (id) => {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        const itemFile = path.join(itemsFolder, sharded(id))
        const itemExists = await fs.access(itemFile).then(() => true).catch(() => false)
        if (!itemExists) return null

        const content = await fs.readFile(itemFile, 'utf8')
        const itemsInFile = deserialize(content) as T[]
        return itemsInFile.find(i => i.id === id) || null
      }))
      return items.filter(item => item != null)
    },

    createIndex: async (field) => {
      indices.push(field)
      await ensureIndex(field)
    },
    dropIndex: async (field) => {
      const [fs, path] = await Promise.all([fsPromise, pathPromise])
      const indexFolder = path.join(folderName, 'index', toSafeFilename(field))
      const exists = await fs.access(indexFolder).then(() => true).catch(() => false)
      if (!exists) throw new Error(`Index on field "${field}" does not exist`)
      await fs.rmdir(indexFolder, { recursive: true })
    },
    readIndex,

    insert: async (items) => {
      const [fs, path] = await Promise.all([fsPromise, pathPromise])
      const itemsFolder = path.join(folderName, 'items')

      await Promise.all(items.map(async (item) => {
        const itemFile = path.join(itemsFolder, sharded(item.id))
        await fs.mkdir(path.dirname(itemFile), { recursive: true })
        const existing = await fs.readFile(itemFile, 'utf8').then(deserialize).catch(() => []) as T[]
        if (existing.some(i => i.id === item.id)) {
          throw new Error(`Item with id "${item.id as string}" already exists`)
        }
        existing.push(item)
        await fs.writeFile(itemFile, serialize(existing))
        await updateAllIndices()
      }))
    },
    replace: async (itemsToReplace) => {
      const [fs, path] = await Promise.all([fsPromise, pathPromise])
      const itemsFolder = path.join(folderName, 'items')

      await Promise.all(itemsToReplace.map(async (item) => {
        const itemFile = path.join(itemsFolder, sharded(item.id))
        await fs.mkdir(path.dirname(itemFile), { recursive: true })
        const existing = await fs.readFile(itemFile, 'utf8').then(deserialize).catch(() => []) as T[]
        const index = existing.findIndex(i => i.id === item.id)
        if (index === -1) {
          throw new Error(`Item with id "${item.id as string}" does not exist`)
        }
        existing[index] = item
        await fs.writeFile(itemFile, serialize(existing))
      }))
      await updateAllIndices()
    },
    remove: async (itemsToRemove) => {
      const [fs, path] = await Promise.all([fsPromise, pathPromise])
      const itemsFolder = path.join(folderName, 'items')

      await Promise.all(itemsToRemove.map(async (item) => {
        const itemFile = path.join(itemsFolder, sharded(item.id))
        const existing = await fs.readFile(itemFile, 'utf8').then(deserialize).catch(() => []) as T[]
        const index = existing.findIndex(i => i.id === item.id)
        if (index === -1) {
          throw new Error(`Item with id "${item.id as string}" does not exist`)
        }
        existing.splice(index, 1)
        if (existing.length === 0) {
          await fs.rm(itemFile)
          return
        }
        await fs.writeFile(itemFile, serialize(existing))
      }))
      await updateAllIndices()
    },
    removeAll: async () => {
      const fs = await fsPromise
      await fs.rmdir(folderName, { recursive: true })
    },
  })
}
