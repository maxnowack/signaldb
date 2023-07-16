import fsSync from 'fs'
import fs from 'fs/promises'
import type PersistenceAdapter from '../types/PersistenceAdapter'

export default function createFilesystemAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(filename: string): PersistenceAdapter<T, I> {
  return {
    async load() {
      const exists = await fs.access(filename).then(() => true).catch(() => false)
      if (!exists) return { items: [] }
      const contents = await fs.readFile(filename, 'utf8')
      const items = JSON.parse(contents)
      return { items }
    },
    async save(items) {
      await fs.writeFile(filename, JSON.stringify(items))
    },
    async register(onChange) {
      const exists = await fs.access(filename).then(() => true).catch(() => false)
      if (!exists) await fs.writeFile(filename, '[]')
      fsSync.watch(filename, { encoding: 'utf8' }, () => {
        void onChange()
      })
    },
  }
}
