import createPersistenceAdapter from './createPersistenceAdapter'

export default function createOPFSAdapter<
  T extends { id: I } & Record<string, any>,
  I,
>(filename: string) {
  let savePromise: Promise<void> | null = null

  async function getItems() {
    const opfsRoot = await navigator.storage.getDirectory();
    const existingFileHandle = await opfsRoot.getFileHandle( filename, { create: true });
    
    const contents = await existingFileHandle.getFile().then(val => val.text())
    return JSON.parse(contents || '[]')
  }

  return createPersistenceAdapter({
    async register(onChange) {

      const opfsRoot = await navigator.storage.getDirectory();
      const existingFileHandle = await opfsRoot.getFileHandle( filename, { create: true });
      void onChange()
    },
    async load() {
      if (savePromise) await savePromise

      const items = await getItems()
      return { items }
    },
    async save(_items, { added, modified, removed }) {
      if (savePromise) await savePromise

      async function write(items){
        const opfsRoot = await navigator.storage.getDirectory();
        const existingFileHandle = await opfsRoot.getFileHandle( filename );
        const writeStream = await existingFileHandle.createWritable()
        await writeStream.write( JSON.stringify(items) )
        await writeStream.close()
      }

      if (added.length === 0 && modified.length === 0 && removed.length === 0) {
        savePromise = write( _items )
        return await savePromise
      }
      savePromise = getItems()
        .then((currentItems) => {
          const items = currentItems.slice()
          added.forEach((item) => {
            items.push(item)
          })
          modified.forEach((item) => {
            const index = items.findIndex(({ id }) => id === item.id)
            
            if (index === -1) throw new Error(`Item with ID ${item.id} not found`)
            items[index] = item
          })
          removed.forEach((item) => {
            const index = items.findIndex(({ id }) => id === item.id)
            
            if (index === -1) throw new Error(`Item with ID ${item.id} not found`)
            items.splice(index, 1)
          })
          return items
        })
        .then( write )
        .then(() => {
          savePromise = null
        })
      await savePromise
    },
  })
}