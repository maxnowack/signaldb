import AppwriteExample from './appwrite/Example'
import FirebaseExample from './firebase/Example'
import ReplicationHttpExample from './replication-http/Example'
import SupabaseExample from './supabase/Example'

export const examples = {
  'replication-http': {
    slug: 'replication-http',
    title: 'HTTP Replication',
    heading: 'SignalDB HTTP Replication Example - Todo App',
    codeUrl: 'https://github.com/maxnowack/signaldb/tree/main/examples/src/examples/replication-http/Example.tsx',
    component: ReplicationHttpExample,
  },
  appwrite: {
    slug: 'appwrite',
    title: 'Appwrite',
    heading: 'SignalDB Appwrite Example - Todo App',
    codeUrl: 'https://github.com/maxnowack/signaldb/tree/main/examples/src/examples/appwrite/Example.tsx',
    component: AppwriteExample,
  },
  firebase: {
    slug: 'firebase',
    title: 'Firebase',
    heading: 'SignalDB Firebase Example - Todo App',
    codeUrl: 'https://github.com/maxnowack/signaldb/tree/main/examples/src/examples/firebase/Example.tsx',
    component: FirebaseExample,
  },
  supabase: {
    slug: 'supabase',
    title: 'Supabase',
    heading: 'SignalDB Supabase Example - Todo App',
    codeUrl: 'https://github.com/maxnowack/signaldb/tree/main/examples/src/examples/supabase/Example.tsx',
    component: SupabaseExample,
  },
}
