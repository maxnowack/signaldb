import './custom.css'
import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'

import SyncExample from './components/SyncExample.vue'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('SyncExample', SyncExample)
  },
} satisfies Theme
