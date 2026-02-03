import type { Collection } from '@signaldb/core'

export type TodoItem = {
  id: string
  text: string
  completed: boolean
}

export type TodoCollection = Collection<TodoItem>
