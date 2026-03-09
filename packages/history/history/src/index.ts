import { Collection, type BaseItem } from '@signaldb/core'

interface UndoRedoable {
  forward(): void,
  backward(): void,
}

class InsertOperation<T extends BaseItem<I>, I> implements UndoRedoable {
  private item: T
  private collection: Collection<T, I>

  public constructor(item: T, collection: Collection<T, I>) {
    this.item = { ...item }
    this.collection = collection
  }

  public forward(): void {
    this.collection.insert(this.item)
  }

  public backward(): void {
    this.collection.removeOne({
      id: this.item.id,
    })
  }
}

class UpdateOperation<T extends BaseItem<I> = BaseItem, I = any> implements UndoRedoable {
  private before: T
  private after: T
  private collection: Collection<T, I, any>

  public constructor(before: T, after: T, collection: Collection<T, I, any>) {
    this.before = { ...before }
    this.after = { ...after }
    this.collection = collection
  }

  public forward(): void {
    this.collection.updateOne(
      { id: this.before.id },
      {
        $set: this.after,
      },
    )
  }

  public backward(): void {
    this.collection.updateOne(
      { id: this.after.id },
      {
        $set: this.before,
      },
    )
  }
}

class RemoveOperation<
  T extends BaseItem<I> = BaseItem,
  I = any,
> extends InsertOperation<T, I> implements UndoRedoable {
  public forward(): void {
    super.backward()
  }

  public backward(): void {
    super.forward()
  }
}

export class SignalDBHistory {
  private history: UndoRedoable[][]
    = []

  private isGlobalBatchRunning = false
  private isCollectionBatchRunning = false
  private currentBatch: UndoRedoable[] = []

  private undoneSteps = 0
  private isUndoingOrRedoing = false
  private readonly maxHistoryLength: number

  // Destruction support
  private removeStaticListeners: () => void
  private removeCollectionListeners: (() => void)[] = []

  public constructor(maxHistoryLength = 100) {
    this.maxHistoryLength = maxHistoryLength
    const startGlobalBatchListener = this.startGlobalBatch.bind(this)
    const endGlobalBatchListener = this.endGlobalBatch.bind(this)
    Collection.staticEvents.on('static.batch.start', startGlobalBatchListener)
    Collection.staticEvents.on('static.batch.end', endGlobalBatchListener)
    this.removeStaticListeners = () => {
      Collection.staticEvents.off(
        'static.batch.start',
        startGlobalBatchListener,
      )
      Collection.staticEvents.off('static.batch.end', endGlobalBatchListener)
    }
  }

  public destroy(): void {
    for (let i = 0; i < this.removeCollectionListeners.length; i++) {
      this.removeCollectionListeners[i]()
    }
    this.removeStaticListeners()
  }

  public addCollection(collection: Collection<BaseItem, any, any>): void {
    const addedListener = (item: BaseItem) => {
      this.pushToBatch(new InsertOperation(item, collection))
    }
    const changedListener = (
      newItem: BaseItem,
      change: any,
      oldItem: BaseItem,
    ) => {
      this.pushToBatch(new UpdateOperation(oldItem, newItem, collection))
    }
    const removedListener = (item: BaseItem) => {
      this.pushToBatch(new RemoveOperation(item, collection))
    }
    const batchStartListener = this.startCollectionBatch.bind(this)
    const batchEndListener = this.endCollectionBatch.bind(this)

    collection.on('added', addedListener)
    collection.on('changed', changedListener)
    collection.on('removed', removedListener)
    collection.on('batch.start', batchStartListener)
    collection.on('batch.end', batchEndListener)

    this.removeCollectionListeners.push(() => {
      collection.off('added', addedListener)
      collection.off('changed', changedListener)
      collection.off('removed', removedListener)
      collection.off('batch.start', batchStartListener)
      collection.off('batch.end', batchEndListener)
    })
  }

  private startGlobalBatch(): void {
    if (this.isGlobalBatchRunning) {
      throw new Error(
        'Cannot start a global batch while another batch is still open.',
      )
    }
    this.isGlobalBatchRunning = true
  }

  private endGlobalBatch(): void {
    if (this.isCollectionBatchRunning) {
      throw new Error(
        'Cannot end global batch while a collection batch is still open.',
      )
    }
    this.isGlobalBatchRunning = false
    this.commitBatch()
  }

  private startCollectionBatch(): void {
    if (this.isCollectionBatchRunning) {
      throw new Error(
        'Cannot start a collection batch while another batch is still open.',
      )
    }
    this.isCollectionBatchRunning = true
  }

  private endCollectionBatch(): void {
    if (!this.isCollectionBatchRunning) {
      throw new Error('Cannot end a collection batch while no batch is open.')
    }
    this.isCollectionBatchRunning = false
    if (!this.isGlobalBatchRunning) {
      this.commitBatch()
    }
  }

  private commitBatch(): void {
    if (this.currentBatch.length === 0) {
      // Don't push empty batches to the history
      return
    }

    // Cut the branch before pushing
    if (this.undoneSteps > 0) {
      this.history.splice(
        this.history.length - this.undoneSteps,
        this.undoneSteps,
      )
      this.undoneSteps = 0
    }

    this.history.push(this.currentBatch)
    this.currentBatch = []

    if (this.history.length > this.maxHistoryLength) {
      this.history.shift()
    }
  }

  private pushToBatch(
    operation: UndoRedoable,
  ): void {
    // Don't record operations that are already in the history
    if (this.isUndoingOrRedoing) {
      return
    }

    this.currentBatch.push(operation)

    if (!this.isGlobalBatchRunning && !this.isCollectionBatchRunning) {
      // No batch, immediately commit
      this.commitBatch()
    }
  }

  public undo(): void {
    if (this.undoneSteps === this.history.length) {
      // Nothing to undo left
      return
    } else {
      const operation
        = this.history[this.history.length - 1 - this.undoneSteps]
      this.isUndoingOrRedoing = true
      try {
        Collection.batch(() => {
          for (let i = operation.length - 1; i >= 0; i--) {
            operation[i].backward()
          }
        })
        this.undoneSteps++
      } finally {
        this.isUndoingOrRedoing = false
      }
    }
  }

  public redo(): void {
    if (this.undoneSteps === 0) {
      // Nothing to redo left
      return
    } else {
      const operation = this.history[this.history.length - this.undoneSteps]
      this.isUndoingOrRedoing = true
      try {
        Collection.batch(() => {
          operation.forEach(op => op.forward())
        })
        this.undoneSteps--
      } finally {
        this.isUndoingOrRedoing = false
      }
    }
  }
}
