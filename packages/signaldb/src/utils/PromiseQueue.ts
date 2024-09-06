export default class PromiseQueue {
  private queue: (() => Promise<any>)[] = []
  private pendingPromise: boolean = false

  // Method to add a new promise to the queue and returns a promise that resolves when this task is done
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

  public hasPendingPromise(): boolean {
    return this.pendingPromise
  }

  // Method to process the queue
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
