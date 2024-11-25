import type { BaseItem } from '../Collection/types'
import type { Changeset, LoadResponse } from '../types/PersistenceAdapter'
import Collection from '../Collection'
import debounce from '../utils/debounce'
import PromiseQueue from '../utils/PromiseQueue'
import createLocalStorageAdapter from '../persistence/createLocalStorageAdapter'
import type PersistenceAdapter from '../types/PersistenceAdapter'
import type ReactivityAdapter from '../types/ReactivityAdapter'
import randomId from '../utils/randomId'
import sync from './sync'
import type { Change, Snapshot, SyncOperation } from './types'

type SyncOptions<T extends Record<string, any>> = {
  name: string,
} & T

interface Options<
  CollectionOptions extends Record<string, any>,
  ItemType extends BaseItem<IdType> = BaseItem,
  IdType = any,
> {
  pull: (
    collectionOptions: SyncOptions<CollectionOptions>,
    pullParameters: {
      lastFinishedSyncStart?: number,
      lastFinishedSyncEnd?: number,
    },
  ) => Promise<LoadResponse<ItemType>>,
  push: (
    collectionOptions: SyncOptions<CollectionOptions>,
    pushParameters: {
      changes: Changeset<ItemType>,
    }
  ) => Promise<void>,
  registerRemoteChange?: (
    collectionOptions: SyncOptions<CollectionOptions>,
    onChange: (data?: LoadResponse<ItemType>) => Promise<void>,
  ) => void,

  id?: string,
  persistenceAdapter?: (
    id: string,
    registerErrorHandler: (handler: (error: Error) => void) => void,
  ) => PersistenceAdapter<any, any>,
  reactivity?: ReactivityAdapter,
  onError?: (collectionOptions: SyncOptions<CollectionOptions>, error: Error) => void,
}

/**
 * Class to manage syncing of collections.
 * @template CollectionOptions
 * @template ItemType
 * @template IdType
 * @example
 * const syncManager = new SyncManager({
 *    pull: async (collectionOptions) => {
 *      const response = await fetch(`/api/collections/${collectionOptions.name}`)
 *      return await response.json()
 *    },
 *    push: async (collectionOptions, { changes }) => {
 *      await fetch(`/api/collections/${collectionOptions.name}`, {
 *        method: 'POST',
 *        body: JSON.stringify(changes),
 *      })
 *    },
 *  })
 *
 *  const collection = new Collection()
 *  syncManager.addCollection(collection, {
 *    name: 'todos',
 *  })
 *
 *  syncManager.sync('todos')
 */
export default class SyncManager<
  CollectionOptions extends Record<string, any>,
  ItemType extends BaseItem<IdType> = BaseItem,
  IdType = any,
> {
  protected options: Options<CollectionOptions, ItemType, IdType>
  protected collections: Map<string, [
    Collection<ItemType, IdType, any>,
    SyncOptions<CollectionOptions>,
  ]> = new Map()

  protected changes: Collection<Change<ItemType>, string>
  protected snapshots: Collection<Snapshot<ItemType>, string>
  protected syncOperations: Collection<SyncOperation, string>
  protected remoteChanges: Collection<Change, string>
  protected syncQueues: Map<string, PromiseQueue> = new Map()
  protected persistenceReady: Promise<void>
  protected isDisposed = false
  protected instanceId = randomId()

  /**
   * @param options Collection options
   * @param options.pull Function to pull data from remote source.
   * @param options.push Function to push data to remote source.
   * @param [options.registerRemoteChange] Function to register a callback for remote changes.
   * @param [options.id] Unique identifier for this sync manager. Only nessesary if you have multiple sync managers.
   * @param [options.persistenceAdapter] Persistence adapter to use for storing changes, snapshots and sync operations.
   * @param [options.reactivity] Reactivity adapter to use for reactivity.
   * @param [options.onError] Function to handle errors that occur async during syncing.
   */
  constructor(options: Options<CollectionOptions, ItemType, IdType>) {
    this.options = options
    const id = this.options.id ?? 'default-sync-manager'
    const { reactivity } = this.options

    let changesErrorHandler: (error: Error) => void = () => {}
    let remoteChangesErrorHandler: (error: Error) => void = () => {}
    let snapshotsErrorHandler: (error: Error) => void = () => {}
    let syncOperationsErrorHandler: (error: Error) => void = () => {}

    const persistenceAdapter = options.persistenceAdapter ?? createLocalStorageAdapter
    const changesPersistenceAdapter = persistenceAdapter(`${id}-changes`, (handler) => {
      changesErrorHandler = handler
    })
    const remoteChangesPersistenceAdapter = persistenceAdapter(`${id}-remote-changes`, (handler) => {
      remoteChangesErrorHandler = handler
    })
    const snapshotsPersistenceAdapter = persistenceAdapter(`${id}-snapshots`, (handler) => {
      snapshotsErrorHandler = handler
    })
    const syncOperationsPersistenceAdapter = persistenceAdapter(`${id}-sync-operations`, (handler) => {
      syncOperationsErrorHandler = handler
    })

    this.changes = new Collection({
      persistence: changesPersistenceAdapter,
      reactivity,
    })
    this.remoteChanges = new Collection({
      persistence: remoteChangesPersistenceAdapter,
      reactivity,
    })
    this.snapshots = new Collection({
      persistence: snapshotsPersistenceAdapter,
      reactivity,
    })
    this.syncOperations = new Collection({
      persistence: syncOperationsPersistenceAdapter,
      reactivity,
    })
    this.changes.on('persistence.error', error => changesErrorHandler(error))
    this.remoteChanges.on('persistence.error', error => remoteChangesErrorHandler(error))
    this.snapshots.on('persistence.error', error => snapshotsErrorHandler(error))
    this.syncOperations.on('persistence.error', error => syncOperationsErrorHandler(error))

    this.persistenceReady = Promise.all([
      new Promise<void>((resolve, reject) => {
        this.syncOperations.once('persistence.error', reject)
        this.syncOperations.once('persistence.init', resolve)
      }),
      new Promise<void>((resolve, reject) => {
        this.changes.once('persistence.error', reject)
        this.changes.once('persistence.init', resolve)
      }),
      new Promise<void>((resolve, reject) => {
        this.remoteChanges.once('persistence.error', reject)
        this.remoteChanges.once('persistence.init', resolve)
      }),
      new Promise<void>((resolve, reject) => {
        this.snapshots.once('persistence.error', reject)
        this.snapshots.once('persistence.init', resolve)
      }),
    ]).then(() => { /* noop */ })

    this.changes.setMaxListeners(1000)
    this.remoteChanges.setMaxListeners(1000)
    this.snapshots.setMaxListeners(1000)
    this.syncOperations.setMaxListeners(1000)
  }

  protected getSyncQueue(name: string) {
    if (this.syncQueues.get(name) == null) {
      this.syncQueues.set(name, new PromiseQueue())
    }
    return this.syncQueues.get(name) as PromiseQueue
  }

  /**
   * Clears all internal data structures
   */
  public async dispose() {
    this.collections.clear()
    this.syncQueues.clear()
    await Promise.all([
      this.changes.dispose(),
      this.remoteChanges.dispose(),
      this.snapshots.dispose(),
      this.syncOperations.dispose(),
    ])
    this.isDisposed = true
  }

  /**
   * Gets a collection with it's options by name
   * @param name Name of the collection
   * @throws Will throw an error if the name wasn't found
   * @returns Tuple of collection and options
   */
  public getCollection(name: string) {
    const entry = this.collections.get(name)
    if (entry == null) throw new Error(`Collection with id '${name}' not found`)
    return entry
  }

  /**
   * Adds a collection to the sync manager.
   * @param collection Collection to add
   * @param options Options for the collection. The object needs at least a `name` property.
   * @param options.name Unique name of the collection
   */
  public addCollection(
    collection: Collection<ItemType, IdType, any>,
    options: SyncOptions<CollectionOptions>,
  ) {
    if (this.isDisposed) throw new Error('SyncManager is disposed')
    if (this.options.registerRemoteChange) {
      this.options.registerRemoteChange(options, async (data) => {
        if (data == null) {
          await this.sync(options.name)
        } else {
          const syncTime = Date.now()
          const syncId = this.syncOperations.insert({
            start: syncTime,
            collectionName: options.name,
            instanceId: this.instanceId,
            status: 'active',
          })
          await this.syncWithData(options.name, data)
            .then(() => {
              // clean up old sync operations
              this.syncOperations.removeMany({
                id: { $ne: syncId },
                collectionName: options.name,
                $or: [
                  { end: { $lte: syncTime } },
                  { status: 'active' },
                ],
              })

              // update sync operation status to done after everthing was finished
              this.syncOperations.updateOne({ id: syncId }, {
                $set: { status: 'done', end: Date.now() },
              })
            })
            .catch((error: Error) => {
              if (this.options.onError) this.options.onError(options, error)
              this.syncOperations.updateOne({ id: syncId }, {
                $set: { status: 'error', end: Date.now(), error: error.stack || error.message },
              })
              throw error
            })
        }
      })
    }

    this.collections.set(options.name, [collection, options])
    collection.on('added', (item) => {
      // skip the change if it was a remote change
      if (this.remoteChanges.findOne({ collectionName: options.name, type: 'insert', data: item })) {
        this.remoteChanges.removeOne({ collectionName: options.name, type: 'insert', data: item })
        return
      }
      this.changes.insert({
        collectionName: options.name,
        time: Date.now(),
        type: 'insert',
        data: item,
      })
      this.schedulePush(options.name)
    })
    collection.on('changed', ({ id }, modifier) => {
      const data = { id, modifier }
      // skip the change if it was a remote change
      if (this.remoteChanges.findOne({ collectionName: options.name, type: 'update', data })) {
        this.remoteChanges.removeOne({ collectionName: options.name, type: 'update', data })
        return
      }
      this.changes.insert({
        collectionName: options.name,
        time: Date.now(),
        type: 'update',
        data,
      })
      this.schedulePush(options.name)
    })
    collection.on('removed', ({ id }) => {
      // skip the change if it was a remote change
      if (this.remoteChanges.findOne({ collectionName: options.name, type: 'remove', data: id })) {
        this.remoteChanges.removeOne({ collectionName: options.name, type: 'remove', data: id })
        return
      }
      this.changes.insert({
        collectionName: options.name,
        time: Date.now(),
        type: 'remove',
        data: id,
      })
      this.schedulePush(options.name)
    })
  }

  protected deboucedPush = debounce((name: string) => {
    this.pushChanges(name).catch(() => { /* error handler is called in sync */ })
  }, 100)

  protected schedulePush(name: string) {
    this.deboucedPush(name)
  }

  /**
   * Starts the sync process for all collections
   */
  public async syncAll() {
    if (this.isDisposed) throw new Error('SyncManager is disposed')
    const errors: {id: string, error: Error}[] = []
    await Promise.all([...this.collections.keys()].map(id =>
      this.sync(id).catch((error: Error) => {
        errors.push({ id, error })
      })))
    if (errors.length > 0) throw new Error(`Error while syncing collections:\n${errors.map(e => `${e.id}: ${e.error.message}`).join('\n\n')}`)
  }

  /**
   * Checks if a collection is currently beeing synced
   * @param [name] Name of the collection. If not provided, it will check if any collection is currently beeing synced.
   * @returns True if the collection is currently beeing synced, false otherwise.
   */
  public isSyncing(name?: string) {
    return this.syncOperations.findOne({
      ...name ? { collectionName: name } : {},
      status: 'active',
    }, { fields: { status: 1 } }) != null
  }

  /**
   * Checks if the sync manager is ready to sync.
   * @returns A promise that resolves when the sync manager is ready to sync.
   */
  public async isReady() {
    await this.persistenceReady
  }

  /**
   * Starts the sync process for a collection
   * @param name Name of the collection
   * @param options Options for the sync process.
   * @param options.force If true, the sync process will be started even if there are no changes and onlyWithChanges is true.
   * @param options.onlyWithChanges If true, the sync process will only be started if there are changes.
   */
  public async sync(name: string, options: { force?: boolean, onlyWithChanges?: boolean } = {}) {
    if (this.isDisposed) throw new Error('SyncManager is disposed')
    await this.isReady()
    const entry = this.getCollection(name)
    const collectionOptions = entry[1]

    const hasActiveSyncs = this.syncOperations.find({
      collectionName: name,
      instanceId: this.instanceId,
      status: 'active',
    }).count() > 0
    const syncTime = Date.now()
    let syncId: string | null = null

    // schedule for next tick to allow other tasks to run first
    await new Promise((resolve) => { setTimeout(resolve, 0) })
    const doSync = async () => {
      const lastFinishedSync = this.syncOperations.findOne({ collectionName: name, status: 'done' }, { sort: { end: -1 } })
      if (options?.onlyWithChanges) {
        const currentChanges = this.changes.find({
          collectionName: name,
          $and: [
            { time: { $lte: syncTime } },
          ],
        }, { sort: { time: 1 } }).count()
        if (currentChanges === 0) return
      }

      if (!hasActiveSyncs) {
        syncId = this.syncOperations.insert({
          start: syncTime,
          collectionName: name,
          instanceId: this.instanceId,
          status: 'active',
        })
      }
      const data = await this.options.pull(collectionOptions, {
        lastFinishedSyncStart: lastFinishedSync?.start,
        lastFinishedSyncEnd: lastFinishedSync?.end,
      })

      await this.syncWithData(name, data)
    }

    await (options?.force ? doSync() : this.getSyncQueue(name).add(doSync))
      .catch((error: Error) => {
        if (syncId != null) {
          if (this.options.onError) this.options.onError(collectionOptions, error)
          this.syncOperations.updateOne({ id: syncId }, {
            $set: { status: 'error', end: Date.now(), error: error.stack || error.message },
          })
        }
        throw error
      })

    if (syncId != null) {
      // clean up old sync operations
      this.syncOperations.removeMany({
        id: { $ne: syncId },
        collectionName: name,
        $or: [
          { end: { $lte: syncTime } },
          { status: 'active' },
        ],
      })

      // update sync operation status to done after everthing was finished
      this.syncOperations.updateOne({ id: syncId }, {
        $set: { status: 'done', end: Date.now() },
      })
    }
  }

  /**
   * Starts the push process for a collection (sync process but only if there are changes)
   * @param name Name of the collection
   */
  public async pushChanges(name: string) {
    await this.sync(name, {
      onlyWithChanges: true,
    })
  }

  protected async syncWithData(
    name: string,
    data: LoadResponse<ItemType>,
  ) {
    const entry = this.getCollection(name)
    const [collection, collectionOptions] = entry

    const syncTime = Date.now()

    const lastFinishedSync = this.syncOperations.findOne({ collectionName: name, status: 'done' }, { sort: { end: -1 } })
    const lastSnapshot = this.snapshots.findOne({ collectionName: name }, { sort: { time: -1 } })
    const currentChanges = this.changes.find({
      collectionName: name,
      $and: [
        { time: { $lte: syncTime } },
      ],
    }, { sort: { time: 1 } }).fetch()

    await sync<ItemType, ItemType['id']>({
      changes: currentChanges,
      lastSnapshot: lastSnapshot?.items,
      data,
      pull: () => this.options.pull(collectionOptions, {
        lastFinishedSyncStart: lastFinishedSync?.start,
        lastFinishedSyncEnd: lastFinishedSync?.end,
      }),
      push: changes => this.options.push(collectionOptions, { changes }),
      insert: (item) => {
        this.remoteChanges.insert({
          collectionName: name,
          time: Date.now(),
          type: 'insert',
          data: item,
        })
        if (item.id && !!collection.findOne({ id: item.id })) {
          // update the item if it already exists
          collection.updateOne({ id: item.id }, { $set: item })
          return
        }
        collection.insert(item)
      },
      update: (itemId, modifier) => {
        this.remoteChanges.insert({
          collectionName: name,
          time: Date.now(),
          type: 'update',
          data: { id: itemId, modifier },
        })
        if (itemId && !collection.findOne({ id: itemId })) {
          // insert the item if it does not exist
          collection.insert({ ...modifier.$set as ItemType, id: itemId })
          return
        }
        collection.updateOne({ id: itemId } as Record<string, any>, modifier)
      },
      remove: (itemId) => {
        this.remoteChanges.insert({
          collectionName: name,
          time: Date.now(),
          type: 'remove',
          data: itemId,
        })
        collection.removeOne({ id: itemId } as Record<string, any>)
      },
      batch: (fn) => {
        collection.batch(() => {
          this.remoteChanges.batch(() => {
            fn()
          })
        })
      },
    })
      .then(async (snapshot) => {
        // clean up old snapshots
        this.snapshots.removeMany({ collectionName: name, time: { $lte: syncTime } })

        // clean up processed changes
        this.changes.removeMany({
          collectionName: name,
          id: { $in: currentChanges.map(c => c.id) },
        })

        // insert new snapshot
        this.snapshots.insert({
          time: syncTime,
          collectionName: name,
          items: snapshot,
        })

        // delay sync operation update to next tick to allow other tasks to run first
        await new Promise((resolve) => { setTimeout(resolve, 0) })
      })
      // check if there are unsynced changes to push
      // after the sync was finished successfully
      .then(() => this.sync(name, {
        force: true,
        onlyWithChanges: true,
      }))
  }
}
