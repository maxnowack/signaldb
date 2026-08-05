import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDirectory = path.dirname(fileURLToPath(import.meta.url))
const resolvePath = (value: string) => path.resolve(rootDirectory, value)

export default defineConfig({
  plugins: [react()],
  base: '/examples/',
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        index: resolvePath('index.html'),
        appwrite: resolvePath('appwrite/index.html'),
        firebase: resolvePath('firebase/index.html'),
        replicationHttp: resolvePath('replication-http/index.html'),
        supabase: resolvePath('supabase/index.html'),
      },
    },
  },
})
