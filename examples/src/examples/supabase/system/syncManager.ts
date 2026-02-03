import { SyncManager } from '@signaldb/sync'
import { createClient } from '@supabase/supabase-js'
import dataAdapter from './dataAdapter'

interface Database {
  public: {
    Tables: {
      todos: {
        Row: {
          completed: boolean | null
          created_at: string
          id: number
          text: string | null
        }
        Insert: {
          completed?: boolean | null
          created_at?: string
          id?: number
          text?: string | null
        }
        Update: {
          completed?: boolean | null
          created_at?: string
          id?: number
          text?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

const supabaseUrl = 'https://jjgysyutehjldurguojg.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpqZ3lzeXV0ZWhqbGR1cmd1b2pnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3MDEyNzU5NTAsImV4cCI6MjAxNjg1MTk1MH0.'
  + 'iW9GSzCpGbIPuE9zIw3shkzj-kmisIrVXGsrYiMiaCk'
const supabase = createClient<Database>(
  supabaseUrl,
  supabaseAnonKey,
)

const syncManager = new SyncManager<
  Record<string, any>,
  { id: string, text: string, completed: boolean }
>({
  id: 'supabase-sync-manager',
  dataAdapter,
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
    const documents = await supabase
      .from(name as any)
      .select()
      .overrideTypes<{ id: string }[]>()
    const items = (documents.data ?? []) as unknown as {
      id: string
      text: string
      completed: boolean
    }[]
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
