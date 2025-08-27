import { SyncManager } from '@signaldb/sync'
import createIndexedDBAdapter from '@signaldb/indexeddb'
import { createClient } from '@supabase/supabase-js'

interface Database {
  public: {
    Tables: {
      todos: {
        Row: {
          completed: boolean | null,
          created_at: string,
          id: number,
          text: string | null,
        },
        Insert: {
          completed?: boolean | null,
          created_at?: string,
          id?: number,
          text?: string | null,
        },
        Update: {
          completed?: boolean | null,
          created_at?: string,
          id?: number,
          text?: string | null,
        },
        Relationships: [],
      },
    },
    Views: {
      [_ in never]: never
    },
    Functions: {
      [_ in never]: never
    },
    Enums: {
      [_ in never]: never
    },
    CompositeTypes: {
      [_ in never]: never
    },
  },
}

const supabase = createClient<Database>(
  'https://jjgysyutehjldurguojg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqZ3lzeXV0ZWhqbGR1cmd1b2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDEyNzU5NTAsImV4cCI6MjAxNjg1MTk1MH0.iW9GSzCpGbIPuE9zIw3shkzj-kmisIrVXGsrYiMiaCk',
)

const syncManager = new SyncManager({
  id: 'supabase-sync-manager',
  storageAdapter: id => createIndexedDBAdapter(id),
  onError: (options, error) => {
    // eslint-disable-next-line no-console
    console.error(options, error)
  },
  registerRemoteChange(_options, onChange) {
    supabase
      .channel('room1')
      .on('postgres_changes', { event: '*', schema: '*' }, () => {
        void onChange()
      })
      .subscribe()
  },
  async pull({ name }) {
    const documents = await supabase.from(name as any).select().overrideTypes<{ id: string }[]>()
    const items = documents.data ?? []
    return { items }
  },
  async push({ name }, { changes }) {
    await Promise.all([
      ...changes.added.map(async ({ id, ...item }) => {
        await supabase.from(name as any).insert(item)
      }),
      ...changes.modified.map(async ({ id, ...item }) => {
        await supabase.from(name as any).update(item).eq('id', id)
      }),
      ...changes.removed.map(async (item) => {
        await supabase.from(name as any).delete().eq('id', item.id)
      }),
    ])
  },
})

export default syncManager
