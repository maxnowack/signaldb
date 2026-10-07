import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config.mts'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    passWithNoTests: true,
    environment: 'happy-dom',
    setupFiles: ['./__tests__/setup.ts'],
    coverage: {
      provider: 'istanbul',
    },
  },
}))
