import { reactive, watch, watchEffect } from 'vue'
import { Collection } from '@signaldb/core'
import type { BaseItem } from '@signaldb/core'
import { SyncManager } from '@signaldb/sync'
import vueReactivityAdapter from '@signaldb/vue'

export type ClientId = 'A' | 'B'
export type Todo = {
  id: string,
  title: string,
  completed: boolean,
  order: number,
}

type Field = 'title' | 'completed' | 'order'

type ServerFieldMeta = {
  time: number,
  clientId: ClientId,
}

type ServerDocument = Todo & {
  meta: Record<Field, ServerFieldMeta>,
}

type ClientState = {
  id: ClientId,
  offline: boolean,
  newTitle: string,
  items: Todo[],
  pending: number,
  conflicts: string[],
  errors: string[],
  editingId: string | null,
  editDraft: string,
}

type ServerState = {
  items: Todo[],
  log: string[],
  lastPush: Record<ClientId, string>,
  lastPull: Record<ClientId, string>,
}

type ClientRuntime = {
  state: ClientState,
  collection: Collection<Todo, string>,
  syncManager: SyncManager<{ clientId: ClientId }, Todo, string>,
}

type ServerRuntime = {
  state: ServerState,
  documents: Record<string, ServerDocument>,
  listeners: Map<ClientId, (data?: { items: Todo[] }) => Promise<void>>,
}

type ChangeSet = {
  added: Todo[],
  modified: Todo[],
  removed: Todo[],
  modifiedFields: Map<string, string[]>,
}

type UpdateData = {
  id: string,
  modifier: { $set?: Partial<Todo> },
}

type RawChange
  = | { time: number, type: 'insert', data: Todo }
    | { time: number, type: 'update', data: UpdateData }
    | { time: number, type: 'remove', data: string }

type ChangeItem = BaseItem<string> & {
  id: string,
  collectionName: string,
}

type SyncManagerWithChanges = {
  changes?: Collection<ChangeItem, string>,
}

/**
 * Build a collection name per client.
 * @param clientId Client identifier.
 * @returns Collection name.
 */
const collectionName = (clientId: ClientId) => `todos_${clientId}`

/**
 * Create state + actions for the sync demo.
 * @returns Demo state and actions.
 */
export function useSyncSimulation() {
  const server = createServer()
  const clientA = createClient('A', server)
  const clientB = createClient('B', server)

  const actions = {
    addTodo: (clientId: ClientId) => addTodo(clientId, clientA, clientB),
    toggleComplete: (clientId: ClientId, id: string) => toggleComplete(
      clientId,
      id,
      clientA,
      clientB,
    ),
    startEdit: (clientId: ClientId, id: string) => startEdit(clientId, id, clientA, clientB),
    finishEdit: (clientId: ClientId, id: string) => finishEdit(clientId, id, clientA, clientB),
    onDragStart: (clientId: ClientId, id: string) => onDragStart(clientId, id),
    onDrop: (clientId: ClientId, targetId: string) => onDrop(
      clientId,
      targetId,
      clientA,
      clientB,
    ),
    onDropEnd: (clientId: ClientId) => onDropEnd(clientId, clientA, clientB),
  }

  return {
    clientA: clientA.state,
    clientB: clientB.state,
    server: server.state,
    actions,
  }
}

const dragging = reactive<{ clientId: ClientId | null, id: string | null }>({
  clientId: null,
  id: null,
})

/**
 * Create the in-memory server runtime.
 * @returns Server runtime.
 */
function createServer(): ServerRuntime {
  const state = reactive<ServerState>({
    items: [],
    log: [],
    lastPush: { A: '', B: '' },
    lastPull: { A: '', B: '' },
  })

  const runtime: ServerRuntime = {
    state,
    documents: {},
    listeners: new Map(),
  }

  seedServer(runtime)
  runtime.state.items = serverSnapshot(runtime)

  return runtime
}

/**
 * Create a client runtime bound to the server.
 * @param id Client identifier.
 * @param server Server runtime.
 * @returns Client runtime.
 */
function createClient(id: ClientId, server: ServerRuntime): ClientRuntime {
  const state = reactive<ClientState>({
    id,
    offline: false,
    newTitle: '',
    items: [],
    pending: 0,
    conflicts: [],
    errors: [],
    editingId: null,
    editDraft: '',
  })

  const name = collectionName(id)
  const collection = new Collection<Todo, string>({
    reactivity: vueReactivityAdapter,
  })
  const syncManager = new SyncManager<{ clientId: ClientId }, Todo, string>({
    reactivity: vueReactivityAdapter,
    pull: async (options) => {
      server.state.lastPull[options.clientId] = nowStamp()
      logServer(server, `${options.clientId} pulled latest data`)
      return { items: serverSnapshot(server) }
    },
    push: async (options, { changes, rawChanges }) => {
      const conflicts = applyServerChanges(server, options.clientId, changes, rawChanges)
      if (conflicts.length > 0) {
        for (const conflict of conflicts) {
          state.conflicts.unshift(conflict)
        }
        state.conflicts.splice(4)
      }
      server.state.lastPush[options.clientId] = nowStamp()
      logServer(server, `${options.clientId} pushed ${describeChanges(changes)}`)
      server.state.items = serverSnapshot(server)
      void notifyRemoteChanges(server)
    },
    registerRemoteChange: (options, onChange) => {
      server.listeners.set(options.clientId, onChange)
      return () => {
        if (server.listeners.get(options.clientId) === onChange) {
          server.listeners.delete(options.clientId)
        }
      }
    },
    onError: (_options, error) => {
      const message = error?.message || String(error)
      state.errors.unshift(message)
      state.errors.splice(5)
    },
  })

  syncManager.addCollection(collection, { name, clientId: id })

  void syncManager.startSync(name)

  void collection.isReady()
    .then(() => syncManager.sync(name))
    .catch(() => { /* ignore demo sync errors */ })

  watchEffect((onCleanup) => {
    const cursor = collection.find({}, { sort: { order: 1, id: 1 } })
    state.items = cursor.fetch()
    onCleanup(() => cursor.cleanup())
  })

  watchEffect((onCleanup) => {
    const syncManagerWithChanges = syncManager as unknown as SyncManagerWithChanges
    const changesCollection = syncManagerWithChanges.changes
    if (!changesCollection) return
    const cursor = changesCollection.find({ collectionName: name })
    state.pending = cursor.count()
    onCleanup(() => cursor.cleanup())
  })

  watch(
    () => state.offline,
    (offline) => {
      if (offline) {
        void syncManager.pauseSync(name)
      } else {
        void syncManager.startSync(name)
      }
    },
    { immediate: true },
  )

  return { state, collection, syncManager }
}

/**
 * Generate a short time stamp.
 * @returns Formatted time string.
 */
function nowStamp() {
  return new Date().toLocaleTimeString()
}

/**
 * Append a message to the server log.
 * @param server Server runtime.
 * @param entry Log entry.
 */
function logServer(server: ServerRuntime, entry: string) {
  server.state.log.unshift(`${nowStamp()} — ${entry}`)
}

/**
 * Snapshot server documents into a sorted list.
 * @param server Server runtime.
 * @returns Sorted items.
 */
function serverSnapshot(server: ServerRuntime) {
  return Object.values(server.documents)
    .map(document => ({
      id: document.id,
      title: document.title,
      completed: document.completed,
      order: document.order,
    }))
    .toSorted((a, b) => (a.order === b.order ? a.id.localeCompare(b.id) : a.order - b.order))
}

/**
 * Notify remote listeners about new server data.
 * @param server Server runtime.
 */
function notifyRemoteChanges(server: ServerRuntime) {
  const payload = { items: serverSnapshot(server) }
  for (const listener of server.listeners.values()) {
    void listener(payload)
  }
}

/**
 * Seed the server with demo items.
 * @param server Server runtime.
 */
function seedServer(server: ServerRuntime) {
  const seeds: Array<Pick<Todo, 'id' | 'title' | 'completed' | 'order'>> = [
    { id: 'seed-1', title: 'Sketch offline edits', completed: false, order: 1 },
    { id: 'seed-2', title: 'Resolve field conflicts', completed: false, order: 2 },
    { id: 'seed-3', title: 'Reorder with drag & drop', completed: true, order: 3 },
  ]

  for (const item of seeds) {
    server.documents[item.id] = {
      ...item,
      meta: {
        title: { time: 1, clientId: 'A' },
        completed: { time: 1, clientId: 'A' },
        order: { time: 1, clientId: 'A' },
      },
    }
  }
}

/**
 * Apply changes from a client to the server state.
 * @param server Server runtime.
 * @param clientId Client identifier.
 * @param changes Change set from SyncManager.
 * @param rawChanges Raw change log for field-level timestamps.
 * @returns Conflict messages.
 */
function applyServerChanges(
  server: ServerRuntime,
  clientId: ClientId,
  changes: ChangeSet,
  rawChanges: RawChange[],
) {
  const conflicts: string[] = []
  const fieldTimes = extractFieldTimes(rawChanges)

  for (const item of changes.added) {
    const document = ensureServerDocument(server, item.id)
    applyFieldUpdate(document, 'title', item.title, fieldTimes, clientId, conflicts, item)
    applyFieldUpdate(document, 'completed', item.completed, fieldTimes, clientId, conflicts, item)
    applyFieldUpdate(document, 'order', item.order, fieldTimes, clientId, conflicts, item)
  }

  for (const item of changes.modified) {
    const document = ensureServerDocument(server, item.id)
    const fields = changes.modifiedFields.get(item.id) || []
    for (const field of fields) {
      switch (field) {
        case 'title': {
          applyFieldUpdate(document, field, item.title, fieldTimes, clientId, conflicts, item)

          break
        }
        case 'completed': {
          applyFieldUpdate(document, field, item.completed, fieldTimes, clientId, conflicts, item)

          break
        }
        case 'order': {
          applyFieldUpdate(document, field, item.order, fieldTimes, clientId, conflicts, item)

          break
        }
      // No default
      }
    }
  }

  for (const item of changes.removed) {
    delete server.documents[item.id]
  }

  return conflicts
}

/**
 * Extract field-level timestamps from raw changes.
 * @param rawChanges Raw change log.
 * @returns Map of item field timestamps.
 */
function extractFieldTimes(rawChanges: RawChange[]) {
  const times = new Map<string, Map<Field, number>>()

  for (const change of rawChanges) {
    if (change.type === 'remove') continue

    const id = change.data.id
    const fields: Field[] = []

    if (change.type === 'insert') {
      fields.push('title', 'completed', 'order')
    } else {
      const modifier = change.data.modifier || {}
      const setFields = Object.keys(modifier.$set || {})
      for (const field of setFields) {
        if (field === 'title' || field === 'completed' || field === 'order') {
          fields.push(field)
        }
      }
    }

    if (fields.length === 0) continue

    if (!times.has(id)) times.set(id, new Map())
    const documentTimes = times.get(id) as Map<Field, number>
    for (const field of fields) {
      const existing = documentTimes.get(field)
      if (existing == null || change.time > existing) {
        documentTimes.set(field, change.time)
      }
    }
  }

  return times
}

/**
 * Ensure a server document exists for the given id.
 * @param server Server runtime.
 * @param id Todo id.
 * @returns Server document.
 */
function ensureServerDocument(server: ServerRuntime, id: string): ServerDocument {
  if (server.documents[id]) return server.documents[id]
  server.documents[id] = {
    id,
    title: '',
    completed: false,
    order: 1,
    meta: {
      title: { time: 0, clientId: 'A' },
      completed: { time: 0, clientId: 'A' },
      order: { time: 0, clientId: 'A' },
    },
  }
  return server.documents[id]
}

/**
 * Apply a field update with deterministic conflict resolution.
 * @param document Server document.
 * @param field Field name.
 * @param value Incoming value.
 * @param fieldTimes Field timestamps.
 * @param clientId Client identifier.
 * @param conflicts Conflict message buffer.
 * @param incomingItem Original incoming item.
 */
function applyFieldUpdate(
  document: ServerDocument,
  field: Field,
  value: Todo[Field],
  fieldTimes: Map<string, Map<Field, number>>,
  clientId: ClientId,
  conflicts: string[],
  incomingItem: Todo,
) {
  const incomingTime = fieldTimes.get(document.id)?.get(field) ?? Date.now()
  const incomingMeta = { time: incomingTime, clientId }
  const current = document.meta[field]

  // Conflict rule: newer field timestamp wins, ties by client id.
  const isNewer = incomingMeta.time > current.time
    || (incomingMeta.time === current.time && incomingMeta.clientId > current.clientId)

  if (isNewer) {
    document[field] = value as never
    document.meta[field] = incomingMeta
  } else {
    const label = incomingItem.title || document.title || document.id
    conflicts.unshift(`Conflict: ${field} on "${label}" kept server value (newer update).`)
  }
}

/**
 * Create a short summary string for changes.
 * @param changes Change set.
 * @param changes.added Added items.
 * @param changes.modified Modified items.
 * @param changes.removed Removed items.
 * @returns Summary string.
 */
function describeChanges(changes: { added: Todo[], modified: Todo[], removed: Todo[] }) {
  const parts: string[] = []
  if (changes.added.length > 0) parts.push(`+${changes.added.length}`)
  if (changes.modified.length > 0) parts.push(`~${changes.modified.length}`)
  if (changes.removed.length > 0) parts.push(`-${changes.removed.length}`)
  return parts.length > 0 ? parts.join(' ') : 'no changes'
}

/**
 * Resolve a client runtime by id.
 * @param clientId Client identifier.
 * @param clientA Client A runtime.
 * @param clientB Client B runtime.
 * @returns Client runtime.
 */
function getClient(clientId: ClientId, clientA: ClientRuntime, clientB: ClientRuntime) {
  return clientId === 'A' ? clientA : clientB
}

/**
 * Insert a new todo on a client.
 * @param clientId Client identifier.
 * @param clientA Client A runtime.
 * @param clientB Client B runtime.
 */
function addTodo(clientId: ClientId, clientA: ClientRuntime, clientB: ClientRuntime) {
  const client = getClient(clientId, clientA, clientB)
  const title = client.state.newTitle.trim()
  if (!title) return

  const order = nextOrder(client.state.items)
  const id = `${clientId}-${Math.random().toString(36).slice(2, 8)}`

  client.collection.insert({ id, title, completed: false, order })
  client.state.newTitle = ''
}

/**
 * Compute the next order value for a list.
 * @param items Current items.
 * @returns New order value.
 */
function nextOrder(items: Todo[]) {
  const lastItem = items.at(-1)
  if (!lastItem) return 1
  return lastItem.order + 1
}

/**
 * Toggle completion for a todo.
 * @param clientId Client identifier.
 * @param id Todo id.
 * @param clientA Client A runtime.
 * @param clientB Client B runtime.
 */
function toggleComplete(
  clientId: ClientId,
  id: string,
  clientA: ClientRuntime,
  clientB: ClientRuntime,
) {
  const client = getClient(clientId, clientA, clientB)
  const item = client.state.items.find(todo => todo.id === id)
  if (!item) return
  client.collection.updateOne({ id }, { $set: { completed: !item.completed } })
}

/**
 * Start inline editing for a todo.
 * @param clientId Client identifier.
 * @param id Todo id.
 * @param clientA Client A runtime.
 * @param clientB Client B runtime.
 */
function startEdit(
  clientId: ClientId,
  id: string,
  clientA: ClientRuntime,
  clientB: ClientRuntime,
) {
  const client = getClient(clientId, clientA, clientB)
  const item = client.state.items.find(todo => todo.id === id)
  if (!item) return
  client.state.editingId = id
  client.state.editDraft = item.title
}

/**
 * Finish editing a todo title.
 * @param clientId Client identifier.
 * @param id Todo id.
 * @param clientA Client A runtime.
 * @param clientB Client B runtime.
 */
function finishEdit(
  clientId: ClientId,
  id: string,
  clientA: ClientRuntime,
  clientB: ClientRuntime,
) {
  const client = getClient(clientId, clientA, clientB)
  if (client.state.editingId !== id) return
  const title = client.state.editDraft.trim()
  if (!title) {
    client.state.editingId = null
    return
  }
  client.collection.updateOne({ id }, { $set: { title } })
  client.state.editingId = null
}

/**
 * Track the item being dragged.
 * @param clientId Client identifier.
 * @param id Todo id.
 */
function onDragStart(clientId: ClientId, id: string) {
  dragging.clientId = clientId
  dragging.id = id
}

/**
 * Handle drop on a specific target item.
 * @param clientId Client identifier.
 * @param targetId Target todo id.
 * @param clientA Client A runtime.
 * @param clientB Client B runtime.
 */
function onDrop(
  clientId: ClientId,
  targetId: string,
  clientA: ClientRuntime,
  clientB: ClientRuntime,
) {
  const client = getClient(clientId, clientA, clientB)
  if (!dragging.id || dragging.clientId !== clientId) return
  if (dragging.id === targetId) return

  const items = client.state.items.filter(item => item.id !== dragging.id)
  const targetIndex = items.findIndex(item => item.id === targetId)
  if (targetIndex === -1) return

  const before = items[targetIndex - 1]
  const after = items[targetIndex]

  let order = 1
  if (!before && after) order = after.order - 1
  else if (before && !after) order = before.order + 1
  else if (before && after) order = (before.order + after.order) / 2

  client.collection.updateOne({ id: dragging.id }, { $set: { order } })
  dragging.clientId = null
  dragging.id = null
}

/**
 * Handle drop at the end of a list.
 * @param clientId Client identifier.
 * @param clientA Client A runtime.
 * @param clientB Client B runtime.
 */
function onDropEnd(
  clientId: ClientId,
  clientA: ClientRuntime,
  clientB: ClientRuntime,
) {
  const client = getClient(clientId, clientA, clientB)
  if (!dragging.id || dragging.clientId !== clientId) return

  const last = client.state.items
    .findLast(item => item.id !== dragging.id)
  const order = last ? last.order + 1 : 1

  client.collection.updateOne({ id: dragging.id }, { $set: { order } })
  dragging.clientId = null
  dragging.id = null
}
