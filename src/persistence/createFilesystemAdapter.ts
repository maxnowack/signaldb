import fs from 'fs'
import createPersistenceAdapter from './createPersistenceAdapter'

export default function createFilesystemAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(filename: string) {
  let savePromise: Promise<void> | null = null
  return createPersistenceAdapter<T, I>({
    async register(onChange) {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) await fs.promises.writeFile(filename, '[]')
      fs.watch(filename, { encoding: 'utf8' }, () => {
        void onChange()
      })
    },
    async load() {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const exists = await fs.promises.access(filename).then(() => true).catch(() => false)
      if (!exists) return { items: [] }
      if (savePromise) await savePromise
      const contents = await fs.promises.readFile(filename, 'utf8')
      const items = JSON.parse(contents)
      return { items }
    },
    async save(items) {
      if (typeof window !== 'undefined') throw new Error('Filesystem adapter is not supported in the browser')
      const content = JSON.stringify(items)
      if (savePromise) await savePromise
      savePromise = fs.promises.writeFile(filename, content)
        .then(() => {
          savePromise = null
        })
      await savePromise
    },
  })
}
