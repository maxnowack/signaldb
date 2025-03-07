import type {
  BaseItem,
  PersistenceAdapter,
  ReactivityAdapter,
  Changeset,
  LoadResponse,
  Selector,
} from '@signaldb/core'
import { Collection, randomId, isEqual, createIndex } from '@signaldb/core'
import debounce from './utils/debounce'
import PromiseQueue from './utils/PromiseQueue'
import sync from './sync'
import type { Change, Snapshot, SyncOperation } from './types'

type SyncOptions<T extends Record<string, any>> = {
  name: string,
} & T

type CleanupFunction = (() => void | Promise<void>) | void

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
  ) => CleanupFunction | Promise<CleanupFunction>,

  id?: string,
  persistenceAdapter?: (
    id: string,
    registerErrorHandler: (handler: (error: Error) => void) => void,
  ) => PersistenceAdapter<any, any>,
  reactivity?: ReactivityAdapter,
  onError?: (collectionOptions: SyncOptions<CollectionOptions>, error: Error) => void,

  autostart?: boolean,
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
  protected collections: Map<string, {
    collection: Collection<ItemType, IdType, any>,
    options: SyncOptions<CollectionOptions>,
    readyPromise: Promise<void>,
    syncPaused: boolean,
    cleanupFunction?: CleanupFunction,
  }> = new Map()

  protected changes: Collection<Change<ItemType>, string>
  protected snapshots: Collection<Snapshot<ItemType>, string>
  protected syncOperations: Collection<SyncOperation, string>
  protected scheduledPushes: Set<string> = new Set()
  protected remoteChanges: Omit<Change, 'id' | 'time'>[] = []
  protected syncQueues: Map<string, PromiseQueue> = new Map()
  protected persistenceReady: Promise<void>
  protected isDisposed = false
  protected instanceId = randomId()
  protected id: string

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
    this.options = {
      autostart: true,
      ...options,
    }
    this.id = this.options.id || 'default-sync-manager'
    const { reactivity } = this.options

    const changesPersistence = this.createPersistenceAdapter('changes')
    const snapshotsPersistence = this.createPersistenceAdapter('snapshots')
    const syncOperationsPersistence = this.createPersistenceAdapter('sync-operations')

    this.changes = new Collection({
      name: `${this.options.id}-changes`,
      persistence: changesPersistence?.adapter,
      indices: [createIndex('collectionName')],
      reactivity,
    })
    this.snapshots = new Collection({
      name: `${this.options.id}-snapshots`,
      persistence: snapshotsPersistence?.adapter,
      indices: [createIndex('collectionName')],
      reactivity,
    })
    this.syncOperations = new Collection({
      name: `${this.options.id}-sync-operations`,
      persistence: syncOperationsPersistence?.adapter,
      indices: [createIndex('collectionName'), createIndex('status')],
      reactivity,
    })
    this.changes.on('persistence.error', error => changesPersistence?.handler(error))
    this.snapshots.on('persistence.error', error => snapshotsPersistence?.handler(error))
    this.syncOperations.on('persistence.error', error => syncOperationsPersistence?.handler(error))

    this.persistenceReady = Promise.all([
      this.syncOperations.isReady(),
      this.changes.isReady(),
      this.snapshots.isReady(),
    ]).then(() => { /* noop */ })

    this.changes.setMaxListeners(1000)
    this.snapshots.setMaxListeners(1000)
    this.syncOperations.setMaxListeners(1000)
  }

  protected createPersistenceAdapter(name: string) {
    if (this.options.persistenceAdapter == null) return

    let errorHandler: (error: Error) => void = () => { /* noop */ }
    const adapter = this.options.persistenceAdapter(`${this.id}-${name}`, (handler) => {
      errorHandler = handler
    })
    return {
      adapter,
      handler: (error: Error) => errorHandler(error),
    }
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
    this.remoteChanges.splice(0, this.remoteChanges.length)
    await Promise.all([
      this.changes.dispose(),
      this.snapshots.dispose(),
      this.syncOperations.dispose(),
    ])
    this.isDisposed = true
  }

  /**
   * Gets a collection with it's options by name
   * @deprecated Use getCollectionProperties instead.
   * @param name Name of the collection
   * @throws Will throw an error if the name wasn't found
   * @returns Tuple of collection and options
   */
  public getCollection(name: string) {
    const { collection, options } = this.getCollectionProperties(name)
    return [collection, options]
  }

  /**
   * Gets collection options by name
   * @param name Name of the collection
   * @throws Will throw an error if the name wasn't found
   * @returns An object of all properties of the collection
   */
  public getCollectionProperties(name: string) {
    const collectionParameters = this.collections.get(name)
    if (collectionParameters == null) throw new Error(`Collection with id '${name}' not found`)
    return collectionParameters
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

    this.collections.set(options.name, {
      collection,
      options,
      readyPromise: collection.isReady(),
      syncPaused: true, // always start paused as the autostart will start it
    })

    const hasRemoteChange = (change: Omit<Change, 'id' | 'time'>) => {
      for (const remoteChange of this.remoteChanges) {
        if (isEqual(remoteChange, change)) {
          return true
        }
      }
      return false
    }
    const removeRemoteChange = (change: Omit<Change, 'id' | 'time'>) => {
      for (let i = 0; i < this.remoteChanges.length; i += 1) {
        if (isEqual(this.remoteChanges[i], change)) {
          this.remoteChanges.splice(i, 1)
          return
        }
      }
    }

    collection.on('added', (item) => {
      // skip the change if it was a remote change
      if (hasRemoteChange({ collectionName: options.name, type: 'insert', data: item })) {
        removeRemoteChange({ collectionName: options.name, type: 'insert', data: item })
        return
      }
      this.changes.insert({
        collectionName: options.name,
        time: Date.now(),
        type: 'insert',
        data: item,
      })

      if (this.getCollectionProperties(options.name).syncPaused) return
      this.schedulePush(options.name)
    })
    collection.on('changed', ({ id }, modifier) => {
      const data = { id, modifier }
      // skip the change if it was a remote change
      if (hasRemoteChange({ collectionName: options.name, type: 'update', data })) {
        removeRemoteChange({ collectionName: options.name, type: 'update', data })
        return
      }
      this.changes.insert({
        collectionName: options.name,
        time: Date.now(),
        type: 'update',
        data,
      })

      if (this.getCollectionProperties(options.name).syncPaused) return
      this.schedulePush(options.name)
    })
    collection.on('removed', ({ id }) => {
      // skip the change if it was a remote change
      if (hasRemoteChange({ collectionName: options.name, type: 'remove', data: id })) {
        removeRemoteChange({ collectionName: options.name, type: 'remove', data: id })
        return
      }
      this.changes.insert({
        collectionName: options.name,
        time: Date.now(),
        type: 'remove',
        data: id,
      })

      if (this.getCollectionProperties(options.name).syncPaused) return
      this.schedulePush(options.name)
    })

    if (this.options.autostart) {
      this.startSync(options.name)
        .catch((error: Error) => {
          if (!this.options.onError) return
          this.options.onError(this.getCollectionProperties(options.name).options, error)
        })
    }
  }

  protected debouncedFlush = debounce(() => {
    this.scheduledPushes.forEach((name) => {
      this.pushChanges(name).catch(() => { /* error handler is called in sync */ })
    })
    this.scheduledPushes.clear()
  }, 100)

  protected schedulePush(name: string) {
    this.scheduledPushes.add(name)
    this.debouncedFlush()
  }

  /**
   * Setup all collections to be synced with remote changes
   * and enable automatic pushing changes to the remote source.
   */
  public async startAll() {
    await Promise.all([...this.collections.keys()].map(id =>
      this.startSync(id)))
  }

  /**
   * Setup a collection to be synced with remote changes
   * and enable automatic pushing changes to the remote source.
   * @param name Name of the collection
   */
  public async startSync(name: string) {
    const collectionParameters = this.getCollectionProperties(name)
    if (!collectionParameters.syncPaused) return // already started

    this.schedulePush(name) // push changes that were made while paused

    const cleanupFunction = this.options.registerRemoteChange
      ? await this.options.registerRemoteChange(
        collectionParameters.options,
        async (data) => {
          if (data == null) {
            await this.sync(name)
          } else {
            const syncTime = Date.now()
            const syncId = this.syncOperations.insert({
              start: syncTime,
              collectionName: name,
              instanceId: this.instanceId,
              status: 'active',
            })
            await this.syncWithData(name, data)
              .then(() => {
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
              })
              .catch((error: Error) => {
                if (this.options.onError) {
                  this.options.onError(this.getCollectionProperties(name).options, error)
                }
                this.syncOperations.updateOne({ id: syncId }, {
                  $set: { status: 'error', end: Date.now(), error: error.stack || error.message },
                })
                throw error
              })
          }
        },
      )
      : undefined
    this.collections.set(name, {
      ...collectionParameters,
      syncPaused: false,
      cleanupFunction,
    })
  }

  /**
   * Pauses the sync process for all collections.
   * This means that the collections will not be synced with remote changes
   * and changes will not automatically be pushed to the remote source.
   */
  public async pauseAll() {
    await Promise.all([...this.collections.keys()].map(id =>
      this.pauseSync(id)))
  }

  /**
   * Pauses the sync process for a collection.
   * This means that the collection will not be synced with remote changes
   * and changes will not automatically be pushed to the remote source.
   * @param name Name of the collection
   */
  public async pauseSync(name: string) {
    const collectionParameters = this.getCollectionProperties(name)
    if (collectionParameters.syncPaused) return // already paused
    if (collectionParameters.cleanupFunction) await collectionParameters.cleanupFunction()
    this.collections.set(name, {
      ...collectionParameters,
      cleanupFunction: undefined,
      syncPaused: true,
    })
  }

  /**
   * Starts the sync process for all collections
   */
  public async syncAll() {
    if (this.isDisposed) throw new Error('SyncManager is disposed')
    const errors: { id: string, error: Error }[] = []
    await Promise.all([...this.collections.keys()].map(id =>
      this.sync(id).catch((error: Error) => {
        errors.push({ id, error })
      })))
    if (errors.length > 0) throw new Error(`Error while syncing collections:\n${errors.map(error => `${error.id}: ${error.error.message}`).join('\n\n')}`)
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
    const { options: collectionOptions, readyPromise } = this.getCollectionProperties(name)
    await readyPromise

    const hasActiveSyncs = this.syncOperations.find({
      collectionName: name,
      instanceId: this.instanceId,
      status: 'active',
    }, {
      reactive: false,
    }).count() > 0
    const syncTime = Date.now()
    let syncId: string | null = null

    // schedule for next tick to allow other tasks to run first
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    const doSync = async () => {
      const lastFinishedSync = this.syncOperations.findOne({
        collectionName: name,
        status: 'done',
      }, {
        sort: { end: -1 },
        reactive: false,
      })
      if (options?.onlyWithChanges) {
        const currentChanges = this.changes.find({
          collectionName: name,
          time: { $lte: syncTime },
        }, {
          sort: { time: 1 },
          reactive: false,
        }).count()
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
    const { collection, options: collectionOptions } = this.getCollectionProperties(name)

    const syncTime = Date.now()

    const lastFinishedSync = this.syncOperations.findOne({
      collectionName: name,
      status: 'done',
    }, {
      sort: { end: -1 },
      reactive: false,
    })
    const lastSnapshot = this.snapshots.findOne({
      collectionName: name,
    } as Selector<Snapshot<any>>, {
      sort: { time: -1 },
      reactive: false,
    })
    const currentChanges = this.changes.find({
      collectionName: name,
      time: { $lte: syncTime },
    }, {
      sort: { time: 1 },
      reactive: false,
    }).fetch()

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
        const itemExists = item.id && !!collection.findOne({
          id: item.id,
        } as Selector<any>, { reactive: false })
        if (itemExists) {
          this.remoteChanges.push({
            collectionName: name,
            type: 'update',
            data: { id: item.id, modifier: { $set: item } },
          })

          // update the item if it already exists
          collection.updateOne({ id: item.id } as Selector<any>, { $set: item })
          return
        }
        this.remoteChanges.push({
          collectionName: name,
          type: 'insert',
          data: item,
        })
        collection.insert(item)
      },
      update: (itemId, modifier) => {
        const itemExists = itemId && !collection.findOne({
          id: itemId,
        } as Selector<any>, { reactive: false })
        if (itemExists) {
          const item = { ...modifier.$set as ItemType, id: itemId }
          this.remoteChanges.push({
            collectionName: name,
            type: 'insert',
            data: item,
          })

          // insert the item if it does not exist
          collection.insert(item)
          return
        }
        this.remoteChanges.push({
          collectionName: name,
          type: 'update',
          data: { id: itemId, modifier },
        })
        collection.updateOne({ id: itemId } as Selector<any>, modifier)
      },
      remove: (itemId) => {
        const itemExists = !!collection.findOne({
          id: itemId,
        } as Selector<any>, { reactive: false })
        if (!itemExists) return
        this.remoteChanges.push({
          collectionName: name,
          type: 'remove',
          data: itemId,
        })
        collection.removeOne({ id: itemId } as Selector<any>)
      },
      batch: (fn) => {
        collection.batch(() => {
          fn()
        })
      },
    })
      .then(async (snapshot) => {
        // clean up old snapshots
        this.snapshots.removeMany({
          collectionName: name,
          time: { $lte: syncTime },
        } as Selector<any>)

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
        await new Promise((resolve) => {
          setTimeout(resolve, 0)
        })

        const hasChanges = this.changes.find({
          collectionName: name,
        }, { reactive: false }).count() > 0

        if (hasChanges) {
          // check if there are unsynced changes to push
          // and sync again if there are any
          await this.sync(name, {
            force: true,
            onlyWithChanges: true,
          })
          return
        }

        // if there are no unsynced changes apply the last snapshot
        // to make sure that collection and snapshot are in sync

        // find all items that are not in the snapshot
        const nonExistingItemIds = collection.find({
          id: { $nin: snapshot.map(item => item.id) },
        } as Selector<any>, {
          reactive: false,
        }).map(item => item.id) as IdType[]

        collection.batch(() => {
          // update all items that are in the snapshot
          snapshot.forEach((item) => {
            const currentItem = collection.findOne({
              id: item.id,
            } as Selector<any>, {
              reactive: false,
            })
            /* istanbul ignore else -- @preserve */
            if (currentItem) {
              /* istanbul ignore if -- @preserve */
              if (!isEqual(currentItem, item)) { // this case should never happen
                this.remoteChanges.push({
                  collectionName: name,
                  type: 'update',
                  data: { id: item.id, modifier: { $set: item } },
                })
                collection.updateOne({ id: item.id } as Selector<any>, { $set: item })
              }
            } else { // this case should never happen
              this.remoteChanges.push({
                collectionName: name,
                type: 'insert',
                data: item,
              })
              collection.insert(item)
            }
          })

          // remove all items that are not in the snapshot
          nonExistingItemIds.forEach((id) => {
            collection.removeOne({ id } as Selector<any>)
          })
        })
      })
  }
}
