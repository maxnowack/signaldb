import type {
  BaseItem,
  DataAdapter,
  ReactivityAdapter,
  Changeset,
  Modifier,
  Selector,
} from '@signaldb/core'
import { DefaultDataAdapter, Collection, randomId } from '@signaldb/core'
import debounce from './utils/debounce'
import PromiseQueue from './utils/PromiseQueue'
import sync from './sync'
import type { Change, LoadResponse, Snapshot, SyncOperation } from './types'

type SyncOptions<T extends Record<string, any>> = {
  name: string,
} & T

type CleanupFunction = (() => void | Promise<void>) | void

interface SyncListeners<ItemType extends BaseItem<IdType>, IdType = any> {
  added: (item: ItemType) => void,
  changed: (item: ItemType, modifier: Modifier<ItemType>) => void,
  removed: (item: ItemType) => void,
}

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
      rawChanges: Omit<Change, 'id' | 'collectionName'>[],
      changes: Changeset<ItemType> & {
        modifiedFields: Map<IdType, string[]>,
      },
    },
  ) => Promise<void>,
  registerRemoteChange?: (
    collectionOptions: SyncOptions<CollectionOptions>,
    onChange: (data?: LoadResponse<ItemType>) => Promise<void>,
  ) => CleanupFunction | Promise<CleanupFunction>,

  id?: string,
  dataAdapter?: DataAdapter,
  reactivity?: ReactivityAdapter,
  onError?: (collectionOptions: SyncOptions<CollectionOptions>, error: Error) => void,

  autostart?: boolean,
  debounceTime?: number,
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
    syncListeners?: SyncListeners<ItemType, IdType>,
  }> = new Map()

  protected changes: Collection<Change<ItemType>, string>
  protected snapshots: Collection<Snapshot<ItemType>, string>
  protected syncOperations: Collection<SyncOperation, string>
  protected scheduledPushes: Set<string> = new Set()
  protected remoteChanges: Omit<Change, 'id' | 'time'>[] = []
  protected syncQueues: Map<string, PromiseQueue> = new Map()
  protected collectionsReady: Promise<void>
  protected isDisposed = false
  protected instanceId = randomId()
  protected id: string
  protected debouncedFlush: () => void

  /**
   * @param options Collection options
   * @param options.pull Function to pull data from remote source.
   * @param options.push Function to push data to remote source.
   * @param [options.registerRemoteChange] Function to register a callback for remote changes.
   * @param [options.id] Unique identifier for this sync manager. Only nessesary if you have multiple sync managers.
   * @param [options.dataAdapter] Data adapter for the collections holding changes, snapshots and sync operations. Defaults to an in-memory `DefaultDataAdapter`.
   * @param [options.reactivity] Reactivity adapter to use for reactivity.
   * @param [options.onError] Function to handle errors that occur async during syncing.
   * @param [options.autostart] Whether to automatically start syncing new collections.
   * @param [options.debounceTime] The time in milliseconds to debounce push operations.
   */
  constructor(options: Options<CollectionOptions, ItemType, IdType>) {
    this.options = {
      autostart: true,
      ...options,
    }
    this.id = this.options.id || 'default-sync-manager'
    const { reactivity } = this.options
    const dataAdapter = this.options.dataAdapter ?? new DefaultDataAdapter()
    this.changes = new Collection(`${this.id}-changes`, dataAdapter, {
      indices: ['collectionName'],
      reactivity,
    })
    this.snapshots = new Collection(`${this.id}-snapshots`, dataAdapter, {
      indices: ['collectionName'],
      reactivity,
    })
    this.syncOperations = new Collection(`${this.id}-sync-operations`, dataAdapter, {
      indices: ['collectionName', 'status'],
      reactivity,
    })

    const readiness = [
      this.syncOperations.ready(),
      this.changes.ready(),
      this.snapshots.ready(),
    ]
    // eslint-disable-next-line unicorn/prefer-await -- the constructor is synchronous
    this.collectionsReady = Promise.all(readiness).then(() => { /* noop */ })
    // The data adapter has reported the failure; `isReady()` and `sync()` still reject with it.
    // eslint-disable-next-line unicorn/prefer-await -- only marks the rejection as handled
    this.collectionsReady.catch(() => { /* reported by the data adapter */ })

    this.changes.setMaxListeners(1000)
    this.snapshots.setMaxListeners(1000)
    this.syncOperations.setMaxListeners(1000)

    this.debouncedFlush = debounce(this.flushScheduledPushes, this.options.debounceTime ?? 100)
  }

  protected getSyncQueue(name: string) {
    if (!this.syncQueues.has(name)) {
      this.syncQueues.set(name, new PromiseQueue())
    }
    return this.syncQueues.get(name) as PromiseQueue
  }

  /**
   * Removes the event listeners this sync manager attached to a registered collection.
   * The collection itself is left untouched, including listeners registered by the user.
   * @param name Name of the collection
   */
  protected detachSyncListeners(name: string) {
    const collectionParameters = this.collections.get(name)
    if (collectionParameters == null) return
    const { collection, syncListeners } = collectionParameters
    if (syncListeners == null) return
    collection.off('added', syncListeners.added)
    collection.off('changed', syncListeners.changed)
    collection.off('removed', syncListeners.removed)
  }

  /**
   * Removes a collection from the sync manager. Pauses the sync process for the collection
   * and detaches all event listeners the sync manager attached to it. The collection itself
   * won't be disposed and stays usable afterwards.
   * @param name Name of the collection
   */
  public async removeCollection(name: string) {
    if (!this.collections.has(name)) return
    await this.pauseSync(name)
    this.detachSyncListeners(name)
    this.collections.delete(name)
    this.syncQueues.delete(name)
    this.scheduledPushes.delete(name)
  }

  /**
   * Clears all internal data structures
   */
  public async dispose() {
    this.isDisposed = true
    // detach the listeners from the user provided collections before disposing the
    // internal collections. Otherwise the listeners would stay attached and reference
    // the disposed internal collections of this sync manager forever.
    for (const name of this.collections.keys()) {
      this.detachSyncListeners(name)
    }
    this.collections.clear()
    this.syncQueues.clear()
    this.scheduledPushes.clear()
    this.remoteChanges.length = 0
    await Promise.all([
      this.changes.dispose(),
      this.snapshots.dispose(),
      this.syncOperations.dispose(),
    ])
  }

  /**
   * Gets a collection with it's options by name
   * @deprecated Use getCollectionProperties instead.
   * @param name Name of the collection
   * @throws {Error} Will throw an error if the name wasn't found
   * @returns Tuple of collection and options
   */
  public getCollection(name: string) {
    const { collection, options } = this.getCollectionProperties(name)
    return [collection, options]
  }

  /**
   * Gets collection options by name
   * @param name Name of the collection
   * @throws {Error} Will throw an error if the name wasn't found
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
  public addCollection<
    CollectionItem extends ItemType = ItemType,
  >(
    collection: Collection<CollectionItem, IdType, any>,
    options: SyncOptions<CollectionOptions>,
  ) {
    if (this.isDisposed) throw new Error('SyncManager is disposed')

    // detach listeners of a previous registration under the same name,
    // otherwise every re-registration would add another set of listeners
    this.detachSyncListeners(options.name)

    const hasRemoteChange = (change: Omit<Change, 'id' | 'time'>) => {
      for (const remoteChange of this.remoteChanges) {
        if (
          (remoteChange == null)
          || (remoteChange.collectionName !== change.collectionName)
          || (remoteChange.type !== change.type)
        ) continue

        if (change.type === 'remove' && remoteChange.data !== change.data) continue
        if (remoteChange.data.id !== change.data.id) continue
        return true
      }
      return false
    }
    const removeRemoteChanges = (collectionName: string, id: IdType) => {
      const newRemoteChanges: (Omit<Change, 'id' | 'time'> | null)[] = [...this.remoteChanges]
      for (let i = 0; i < newRemoteChanges.length; i += 1) {
        const item = newRemoteChanges[i]
        if ((item == null) || (item.collectionName !== collectionName)) continue
        if (item.type === 'remove' && item.data !== id) continue
        if (item.data.id !== id) continue
        newRemoteChanges[i] = null
      }
      this.remoteChanges = newRemoteChanges.filter(item => item != null)
    }

    /**
     * Persists a local change and schedules a push for it, reporting failures to `onError`
     * @param change The change to persist
     */
    const persistChange = async (change: Omit<Change, 'id'>) => {
      try {
        await this.changes.insert(change)
        if (this.getCollectionProperties(options.name).syncPaused) return
        this.schedulePush(options.name)
      } catch (error) {
        if (!this.options.onError) return
        this.options.onError(this.getCollectionProperties(options.name).options, error as Error)
      }
    }

    const onAdded: SyncListeners<CollectionItem, IdType>['added'] = (item) => {
      if (this.isDisposed) return
      // skip the change if it was a remote change
      if (hasRemoteChange({ collectionName: options.name, type: 'insert', data: item })) {
        removeRemoteChanges(options.name, item.id)
        return
      }
      void persistChange({
        collectionName: options.name,
        time: Date.now(),
        type: 'insert',
        data: item,
      })
    }
    const onChanged: SyncListeners<CollectionItem, IdType>['changed'] = ({ id }, modifier) => {
      if (this.isDisposed) return
      const data = { id, modifier }
      // skip the change if it was a remote change
      if (hasRemoteChange({ collectionName: options.name, type: 'update', data })) {
        removeRemoteChanges(options.name, id)
        return
      }
      void persistChange({
        collectionName: options.name,
        time: Date.now(),
        type: 'update',
        data,
      })
    }
    const onRemoved: SyncListeners<CollectionItem, IdType>['removed'] = ({ id }) => {
      if (this.isDisposed) return
      // skip the change if it was a remote change
      if (hasRemoteChange({ collectionName: options.name, type: 'remove', data: id })) {
        removeRemoteChanges(options.name, id)
        return
      }
      void persistChange({
        collectionName: options.name,
        time: Date.now(),
        type: 'remove',
        data: id,
      })
    }

    collection.on('added', onAdded)
    collection.on('changed', onChanged)
    collection.on('removed', onRemoved)

    const syncListeners = {
      added: onAdded,
      changed: onChanged,
      removed: onRemoved,
    } as unknown as SyncListeners<ItemType, IdType>

    const readyPromise = collection.ready()
    // A collection that failed to load has reported it itself; `sync()` rejects with it.
    // eslint-disable-next-line unicorn/prefer-await -- only marks the rejection as handled
    readyPromise.catch(() => { /* reported by the data adapter */ })
    this.collections.set(options.name, {
      collection: collection as unknown as Collection<ItemType, IdType, any>,
      options,
      readyPromise,
      syncPaused: true, // always start paused as the autostart will start it
      syncListeners,
    })

    if (this.options.autostart) {
      this.startSync(options.name)
        // eslint-disable-next-line unicorn/prefer-await -- addCollection is synchronous
        .catch((error: Error) => {
          if (!this.options.onError) return
          this.options.onError(this.getCollectionProperties(options.name).options, error)
        })
    }
  }

  protected flushScheduledPushes() {
    this.scheduledPushes.forEach((name) => {
      // eslint-disable-next-line unicorn/prefer-await -- flushScheduledPushes is synchronous
      this.pushChanges(name).catch(() => { /* error handler is called in sync */ })
    })
    this.scheduledPushes.clear()
  }

  protected schedulePush(name: string) {
    this.scheduledPushes.add(name)
    this.debouncedFlush()
  }

  /**
   * Setup all collections to be synced with remote changes
   * and enable automatic pushing changes to the remote source.
   */
  public async startAll() {
    await Promise.all(Array.from(this.collections.keys(), id =>
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
          if (this.isDisposed) return

          if (data == null) {
            // if no data is provided, we will sync the collection with the remote source
            await this.sync(name)
          } else {
            // if data is provided, we will sync the collection with the provided data
            await this.getSyncQueue(name).add(async () => {
              const syncTime = Date.now()
              const syncId = await this.syncOperations.insert({
                start: syncTime,
                collectionName: name,
                instanceId: this.instanceId,
                status: 'active',
              })
              try {
                await this.syncWithData(name, data)
                if (this.isDisposed) return
                // clean up old sync operations
                await this.syncOperations.removeMany({
                  id: { $ne: syncId },
                  collectionName: name,
                  $or: [
                    { end: { $lte: syncTime } },
                    { status: 'active' },
                  ],
                })

                // update sync operation status to done after everthing was finished
                await this.syncOperations.updateOne({ id: syncId }, {
                  $set: { status: 'done', end: Date.now() },
                })
              } catch (error) {
                const syncError = error as Error
                if (this.options.onError) {
                  this.options.onError(this.getCollectionProperties(name).options, syncError)
                }
                await this.syncOperations.updateOne({ id: syncId }, {
                  $set: {
                    status: 'error',
                    end: Date.now(),
                    error: syncError.stack || syncError.message,
                  },
                })
                throw error
              }
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
    await Promise.all(Array.from(this.collections.keys(), id =>
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
    await Promise.all(Array.from(this.collections.keys(), id =>
      // eslint-disable-next-line unicorn/prefer-await -- collects the error per collection
      this.sync(id).catch((error: Error) => {
        errors.push({ id, error })
      })))
    if (errors.length > 0) throw new Error(`Error while syncing collections:\n${errors.map(error => `${error.id}: ${error.error.message}`).join('\n\n')}`)
  }

  /**
   * Checks if a collection is currently beeing synced
   * ⚡️ this function is reactive!
   * @param [name] Name of the collection. If not provided, it will check if any collection is currently beeing synced.
   * @param [async] If true, it will check for active syncs in the database. This is useful if you have multiple instances of the application running.
   * @returns True if the collection is currently beeing synced, false otherwise. If async is true, it will return a promise that resolves to true or false.
   */
  public isSyncing(
    name: string | undefined,
    // eslint-disable-next-line unicorn/consistent-boolean-name -- documented public parameter name
    async: true,
  ): Promise<boolean>

  public isSyncing(
    name?: string,
    // eslint-disable-next-line unicorn/consistent-boolean-name -- documented public parameter name
    async?: false,
  ): boolean

  public isSyncing<Async extends boolean = false>(
    name?: string,
    async?: Async,
  ): Promise<boolean> | boolean {
    const itemOrPromise = this.syncOperations.findOne({
      ...name && { collectionName: name },
      status: 'active',
    }, { fields: { status: 1 }, async })
    return itemOrPromise instanceof Promise
      ? itemOrPromise
        // eslint-disable-next-line unicorn/prefer-await -- answers synchronously unless async is set
        .then(item => item != null)
      : (itemOrPromise != null)
  }

  /**
   * Checks if the sync manager is ready to sync.
   * @returns A promise that resolves when the sync manager is ready to sync.
   */
  public async isReady() {
    await this.collectionsReady
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

    const hasActiveSyncs = await this.syncOperations.find({
      collectionName: name,
      instanceId: this.instanceId,
      status: 'active',
    }, {
      reactive: false,
      async: true,
    }).count() > 0
    const syncTime = Date.now()
    let syncId: string | null = null

    // schedule for next tick to allow other tasks to run first
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })
    const doSync = async () => {
      const lastFinishedSync = await this.syncOperations.findOne({
        collectionName: name,
        status: 'done',
      }, {
        sort: { end: -1 },
        reactive: false,
        async: true,
      })
      if (options?.onlyWithChanges) {
        const currentChanges = await this.changes.find({
          collectionName: name,
          time: { $lte: syncTime },
        }, {
          sort: { time: 1 },
          reactive: false,
          async: true,
        }).count()
        if (currentChanges === 0) return
      }

      if (!hasActiveSyncs) {
        syncId = await this.syncOperations.insert({
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

    try {
      await (options?.force ? doSync() : this.getSyncQueue(name).add(doSync))
    } catch (error) {
      const syncError = error as Error
      if (syncId != null) {
        if (this.options.onError) this.options.onError(collectionOptions, syncError)
        await this.syncOperations.updateOne({ id: syncId }, {
          $set: { status: 'error', end: Date.now(), error: syncError.stack || syncError.message },
        })
      }
      throw error
    }

    if (syncId == null) {
      return
    }

    // clean up old sync operations
    await this.syncOperations.removeMany({
      id: { $ne: syncId },
      collectionName: name,
      $or: [
        { end: { $lte: syncTime } },
        { status: 'active' },
      ],
    })

    // update sync operation status to done after everthing was finished
    await this.syncOperations.updateOne({ id: syncId }, {
      $set: { status: 'done', end: Date.now() },
    })
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
    if (this.isDisposed) return
    const { collection, options: collectionOptions } = this.getCollectionProperties(name)

    const syncTime = Date.now()

    const lastFinishedSync = await this.syncOperations.findOne({
      collectionName: name,
      status: 'done',
    }, {
      sort: { end: -1 },
      reactive: false,
      async: true,
    })
    const lastSnapshot = await this.snapshots.findOne({
      collectionName: name,
    } as Selector<Snapshot<any>>, {
      sort: { time: -1 },
      reactive: false,
      async: true,
    })
    const currentChanges = await this.changes.find({
      collectionName: name,
      time: { $lte: syncTime },
    }, {
      sort: { time: 1 },
      reactive: false,
      async: true,
    }).fetch()

    const snapshot = await sync<ItemType, ItemType['id']>({
      changes: currentChanges,
      lastSnapshot: lastSnapshot?.items,
      data,
      pull: () => this.options.pull(collectionOptions, {
        lastFinishedSyncStart: lastFinishedSync?.start,
        lastFinishedSyncEnd: lastFinishedSync?.end,
      }),
      push: changes => this.options.push(collectionOptions, {
        changes,
        rawChanges: currentChanges,
      }),
      insert: async (item) => {
        // add multiple remote changes as we don't know if the item will be updated or inserted during replace
        this.remoteChanges.push({
          collectionName: name,
          type: 'insert',
          data: item,
        }, {
          collectionName: name,
          type: 'update',
          data: { id: item.id, modifier: { $set: item } },
        })

        // replace the item
        await collection.replaceOne({ id: item.id } as Selector<any>, item, { upsert: true })
      },
      update: async (itemId, modifier) => {
        // add multiple remote changes as we don't know if the item will be updated or inserted during replace
        this.remoteChanges.push({
          collectionName: name,
          type: 'insert',
          data: { id: itemId, ...modifier.$set },
        }, {
          collectionName: name,
          type: 'update',
          data: { id: itemId, modifier },
        })

        await collection.updateOne({ id: itemId } as Selector<any>, {
          ...modifier,
          $setOnInsert: { id: itemId } as Partial<ItemType>,
        }, { upsert: true })
      },
      remove: async (itemId) => {
        const isItemExists = await collection.find({
          id: itemId,
        } as Selector<any>, { reactive: false, async: true }).count() > 0
        if (!isItemExists) return
        this.remoteChanges.push({
          collectionName: name,
          type: 'remove',
          data: itemId,
        })
        await collection.removeOne({ id: itemId } as Selector<any>)
      },
      batch: async (fn) => {
        return collection.batch(async () => {
          await fn()
        })
      },
    })

    if (this.isDisposed) return

    // clean up old snapshots
    await this.snapshots.removeMany({
      collectionName: name,
      time: { $lte: syncTime },
    } as Selector<any>)

    // clean up processed changes
    await this.changes.removeMany({
      collectionName: name,
      id: { $in: currentChanges.map(c => c.id) },
    })

    // insert new snapshot
    await this.snapshots.insert({
      time: syncTime,
      collectionName: name,
      items: snapshot,
    })

    // delay sync operation update to next tick to allow other tasks to run first
    await new Promise((resolve) => {
      setTimeout(resolve, 0)
    })

    const hasChanges = await this.changes.find({
      collectionName: name,
    }, { reactive: false, async: true }).count() > 0

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
    const nonExistingItemIds = await collection.find({
      id: { $nin: snapshot.map(item => item.id) },
    } as Selector<any>, {
      reactive: false,
      async: true,
    }).map(item => item.id) as IdType[]

    await collection.batch(async () => {
      // update all items that are in the snapshot
      await Promise.all(snapshot.map(async (item) => {
        // add multiple remote changes as we don't know if the item will be updated or inserted during replace
        this.remoteChanges.push({
          collectionName: name,
          type: 'insert',
          data: item,
        }, {
          collectionName: name,
          type: 'update',
          data: { id: item.id, modifier: { $set: item } },
        })

        // replace the item
        await collection.replaceOne({ id: item.id } as Selector<any>, item, { upsert: true })
      }))

      // remove all items that are not in the snapshot
      await Promise.all(nonExistingItemIds.map(async (id) => {
        await collection.removeOne({ id } as Selector<any>)
      }))
    })
  }
}
