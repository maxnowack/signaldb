import type { Collection } from '@signaldb/core'
import type { SyncManager } from '@signaldb/sync'

const DEFAULT_TIMEOUT_MS = 2000

type ChangeItem = {
  id: string,
  collectionName: string,
  type: string,
  data?: { id?: string },
}

/**
 *
 * @param syncManager
 * @param collectionName
 * @param id
 */
/**
 * Waits until the sync manager records a local insert for a collection.
 * @param syncManager Sync manager instance to observe.
 * @param collectionName Collection name to match.
 * @param id Optional item id to match.
 * @returns Resolves once the insert is recorded.
 */
export async function waitForLocalInsert(
  syncManager: SyncManager<any, any>,
  collectionName: string,
  id?: string,
) {
  const changes = (syncManager as unknown as {
    changes: Collection<ChangeItem, string, any>,
  }).changes

  await changes.ready()

  const hasInsert = async () => {
    const selector = id
      ? { collectionName, 'type': 'insert', 'data.id': id }
      : { collectionName, type: 'insert' }
    const existing = await changes.find(selector, { async: true }).fetch()
    return existing.length > 0
  }

  if (await hasInsert()) return

  await new Promise<void>((resolve, reject) => {
    const timeoutReference = {
      current: setTimeout(() => {
        changes.off('added', handler)
        reject(new Error(`Timed out waiting for local insert in ${collectionName}`))
      }, DEFAULT_TIMEOUT_MS),
    }

    /**
     *
     * @param change
     */
    /**
     * Handle inserts from the changes collection.
     * @param change Recorded change entry.
     */
    function handler(change: ChangeItem) {
      if (change.collectionName !== collectionName) return
      if (change.type !== 'insert') return
      if (id && change.data?.id !== id) return
      clearTimeout(timeoutReference.current)
      changes.off('added', handler)
      resolve()
    }

    changes.on('added', handler)
  })
}
