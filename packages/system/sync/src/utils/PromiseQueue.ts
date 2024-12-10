/**
 * Class for queuing promises to be executed one after the other.
 * This is useful for tasks that should not be executed in parallel.
 * @example
 * const queue = new PromiseQueue();
 * queue.add(() => fetch('https://example.com/api/endpoint1'));
 * queue.add(() => fetch('https://example.com/api/endpoint2'));
 * // The second fetch will only be executed after the first one is done.
 */
export default class PromiseQueue {
  private queue: (() => Promise<any>)[] = []
  private pendingPromise: boolean = false

  /**
   * Method to add a new promise to the queue and returns a promise that resolves when this task is done
   * @param task Function that returns a promise that will be added to the queue
   * @returns Promise that resolves when the task is done
   */
  add(task: () => Promise<any>): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      // Wrap the task with the resolve and reject to control its completion from the outside
      this.queue.push(() => task()
        .then(resolve)
        .catch((error: Error) => {
          reject(error)
          throw error
        }))
      this.dequeue()
    })
  }

  /**
   * Method to check if there is a pending promise in the queue
   * @returns True if there is a pending promise, false otherwise
   */
  public hasPendingPromise(): boolean {
    return this.pendingPromise
  }

  /**
   * Method to process the queue
   */
  private dequeue() {
    if (this.pendingPromise || this.queue.length === 0) {
      return
    }
    const task = this.queue.shift()
    if (!task) return
    this.pendingPromise = true
    task()
      .then(() => {
        this.pendingPromise = false
        this.dequeue()
      })
      .catch(() => {
        this.pendingPromise = false
        this.dequeue()
      })
  }
}
