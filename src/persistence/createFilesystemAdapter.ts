import type fsType from 'fs'
import createPersistenceAdapter from './createPersistenceAdapter'

// weird workaround to make the unbuild bundle work in the browser
const loadFsModule = async () => {
  const fsModule = 'fs'
  const fs: typeof fsType = await import(fsModule)
  return fs
}

export default function createFilesystemAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(filename: string) {
  return createPersistenceAdapter<T, I>({
    async register(onChange) {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const fs = await loadFsModule()
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) await fs.promises.writeFile(filename, '[]')
      fs.watch(filename, { encoding: 'utf8' }, () => {
        void onChange()
      })
    },
    async load() {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const fs = await loadFsModule()
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) return { items: [] }
      const contents = await fs.promises.readFile(filename, 'utf8')
      const items = JSON.parse(contents)
      return { items }
    },
    async save(items) {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const fs = await loadFsModule()
      await fs.promises.writeFile(filename, JSON.stringify(items))
    },
  })
}
