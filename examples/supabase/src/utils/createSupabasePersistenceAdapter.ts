import { createClient } from '@supabase/supabase-js'
import { createPersistenceAdapter } from 'signaldb'

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

export default function createAppwritePersistenceAdapter<
  T extends { id: U },
  U extends string,
>(
  collectionId: string,
) {
  return createPersistenceAdapter<T, U>({
    register: async (onChange) => {
      supabase
        .channel('room1')
        .on('postgres_changes', { event: '*', schema: '*' }, () => {
          void onChange()
        })
        .subscribe()

      return Promise.resolve()
    },
    save: async (_items, changes) => {
      await Promise.all([
        ...changes.added.map(async ({ id, ...item }) => {
          await supabase.from(collectionId as any).insert(item)
        }),
        ...changes.modified.map(async ({ id, ...item }) => {
          await supabase.from(collectionId as any).update(item).eq('id', id)
        }),
        ...changes.removed.map(async (item) => {
          await supabase.from(collectionId as any).delete().eq('id', item.id)
        }),
      ])
    },
    load: async () => {
      const docs = await supabase.from(collectionId as any).select().returns<T[]>()
      return { items: docs.data ?? [] }
    },
  })
}
