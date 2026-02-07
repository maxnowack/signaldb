import fs from 'fs/promises'
import path from 'path'
import { createRequire } from 'module'
import { withMermaid } from 'vitepress-plugin-mermaid'
import llmstxt from 'vitepress-plugin-llms'

const require = createRequire(import.meta.url)
const package_ = require('../../packages/base/core/package.json')

/**
 * Builds an HTML string for redirecting to a specified URL.
 * @param to - The URL to redirect to.
 * @returns The HTML string for the redirect.
 */
function buildRedirectHtml(to: string) {
  return `<!DOCTYPE html><html><title>Redirecting...</title><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}"><body><a href="${to}">Redirecting...</a></body></html>`
}

// https://vitepress.dev/reference/site-config
export default withMermaid({
  vite: {
    plugins: [llmstxt()],
  },
  title: 'SignalDB',
  description: 'A reactive local JavaScript database with a MongoDB-like interface, first-class TypeScript support and signal-based reactivity.',
  lastUpdated: true,

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Documentation', link: '/getting-started/' },
      { text: 'Reference', link: '/reference/' },
      {
        text: package_.version,
        items: [
          {
            text: 'Changelog',
            link: '/changelog/core/',
          },
          {
            text: 'Contributing',
            link: 'https://github.com/maxnowack/signaldb/blob/main/CONTRIBUTING.md',
          },
        ],
      },
    ],

    outline: {
      level: [2, 3],
    },

    sidebar: {
      '/': [
        {
          text: 'Documentation',
          collapsed: false,
          items: [
            { text: 'Getting Started', link: '/getting-started/' },
            { text: 'Core Concepts', link: '/core-concepts/' },
            { text: 'Querying Data', link: '/queries/' },
            { text: 'Data manipulation', link: '/data-manipulation/' },
            { text: 'Data Storage', link: '/data-persistence/' },
            { text: 'Reactivity', link: '/reactivity/' },
            { text: 'Synchronization', link: '/sync/' },
            { text: 'ORM', link: '/orm/' },
            { text: 'Developer Tools', link: '/devtools/' },
            { text: 'Schema Validation', link: '/schema-validation/' },
            { text: 'Upgrade to v2', link: '/upgrade/v2/' },
            { text: 'Upgrade to v1', link: '/upgrade/v1/' },
          ],
        },
        {
          text: 'Changelog',
          collapsed: true,
          items: [
            { text: '@signaldb/core', link: '/changelog/core/' },
            { text: '@signaldb/sync', link: '/changelog/sync/' },
            { text: '@signaldb/devtools', link: '/changelog/devtools/' },
            { text: '@signaldb/react', link: '/changelog/react/' },
            { text: '@signaldb/fs', link: '/changelog/fs/' },
            { text: '@signaldb/indexeddb', link: '/changelog/indexeddb/' },
            { text: '@signaldb/localstorage', link: '/changelog/localstorage/' },
            { text: '@signaldb/opfs', link: '/changelog/opfs/' },
            { text: '@signaldb/angular', link: '/changelog/angular/' },
            { text: '@signaldb/maverickjs', link: '/changelog/maverickjs/' },
            { text: '@signaldb/meteor', link: '/changelog/meteor/' },
            { text: '@signaldb/mobx', link: '/changelog/mobx/' },
            { text: '@signaldb/oby', link: '/changelog/oby/' },
            { text: '@signaldb/preact', link: '/changelog/preact/' },
            { text: '@signaldb/reactively', link: '/changelog/reactively/' },
            { text: '@signaldb/sinuous', link: '/changelog/sinuous/' },
            { text: '@signaldb/sjs', link: '/changelog/sjs/' },
            { text: '@signaldb/solid', link: '/changelog/solid/' },
            { text: '@signaldb/svelte', link: '/changelog/svelte/' },
            { text: '@signaldb/usignal', link: '/changelog/usignal/' },
            { text: '@signaldb/vue', link: '/changelog/vue/' },
          ],
        },
        {
          text: 'Guides',
          collapsed: false,
          items: [
            { text: 'Angular', link: '/guides/angular/' },
            { text: 'React', link: '/guides/react/' },
            { text: 'Solid', link: '/guides/solid-js/' },
            { text: 'Svelte', link: '/guides/svelte/' },
            { text: 'Vue', link: '/guides/vue/' },
          ],
        },
        {
          text: 'Examples',
          collapsed: false,
          items: [
            { text: 'HTTP Replication', link: 'https://signaldb.js.org/examples/replication-http/' },
            { text: 'Appwrite', link: 'https://signaldb.js.org/examples/appwrite/' },
            { text: 'Firebase', link: 'https://signaldb.js.org/examples/firebase/' },
            { text: 'Supabase', link: 'https://signaldb.js.org/examples/supabase/' },
          ],
        },
        {
          text: 'Help',
          collapsed: false,
          items: [
            { text: 'Troubleshooting', link: '/troubleshooting/' },
            { text: 'Github Issues', link: 'https://github.com/maxnowack/signaldb/issues' },
            { text: 'Community', link: 'https://github.com/maxnowack/signaldb/discussions' },
            { text: 'Discord', link: 'https://discord.gg/qMvXKXxBTp' },
          ],
        },
        {
          text: 'Articles',
          collapsed: true,
          items: [
            { text: 'Signals', link: '/signals/' },
            { text: 'Live Updates', link: '/live-updates/' },
            { text: 'Optimistic UI', link: '/optimistic-ui/' },
            { text: 'Real-Time Web Apps', link: '/real-time/' },
            { text: 'Offline-First', link: '/offline-first/' },
            { text: 'Reactive Databases', link: '/reactive-databases/' },
            { text: 'AWS Amplify', link: '/aws-amplify/' },
            { text: 'Firebase', link: '/firebase/' },
            { text: 'Supabase', link: '/supabase/' },
          ],
        },
      ],
      '/reference/': [
        {
          text: 'Base',
          items: [
            {
              text: '@signaldb/core',
              collapsed: true,
              items: [
                { text: 'Collection', link: '/reference/core/collection/' },
                { text: 'Cursor', link: '/reference/core/cursor/' },
                { text: 'AutoFetchCollection', link: '/reference/core/autofetchcollection/' },
                { text: 'createIndex', link: '/reference/core/createindex/' },
                { text: 'createIndexProvider', link: '/reference/core/createindexprovider/' },
                { text: 'createMemoryAdapter', link: '/reference/core/creatememoryadapter/' },
                { text: 'createStorageAdapter', link: '/reference/core/createstorageadapter/' },
                { text: 'createReactivityAdapter', link: '/reference/core/createreactivityadapter/' },
              ],
            },
            { text: '@signaldb/sync', link: '/reference/sync/' },
          ],
        },
        {
          text: 'Integrations',
          items: [
            { text: '@signaldb/react', link: '/reference/react/' },
          ],
        },
        {
          text: 'Storage Adapters',
          items: [
            { text: '@signaldb/fs', link: '/reference/fs/' },
            { text: '@signaldb/indexeddb', link: '/reference/indexeddb/' },
            { text: '@signaldb/localstorage', link: '/reference/localstorage/' },
            { text: '@signaldb/opfs', link: '/reference/opfs/' },
          ],
        },
        {
          text: 'Reactivity Adapters',
          items: [
            { text: '@signaldb/angular', link: '/reference/angular/' },
            { text: '@signaldb/maverickjs', link: '/reference/maverickjs/' },
            { text: '@signaldb/meteor', link: '/reference/meteor/' },
            { text: '@signaldb/mobx', link: '/reference/mobx/' },
            { text: '@signaldb/oby', link: '/reference/oby/' },
            { text: '@signaldb/preact', link: '/reference/preact/' },
            { text: '@signaldb/reactively', link: '/reference/reactively/' },
            { text: '@signaldb/sinuous', link: '/reference/sinuous/' },
            { text: '@signaldb/sjs', link: '/reference/sjs/' },
            { text: '@signaldb/solid', link: '/reference/solid/' },
            { text: '@signaldb/svelte', link: '/reference/svelte/' },
            { text: '@signaldb/usignal', link: '/reference/usignal/' },
            { text: '@signaldb/vue', link: '/reference/vue/' },
          ],
        },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/maxnowack/signaldb' },
    ],

    search: {
      provider: 'local',
    },

    editLink: {
      pattern: 'https://github.com/maxnowack/signaldb/edit/main/docs/:path',
      text: 'Edit this page on GitHub',
    },

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2023-present <a href="https://nowack.dev" target="_blank" rel="noopener">Max Nowack</a>',
    },
  },

  rewrites: {
    'articles/:article.md': ':article/index.md',
  },

  head: [
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
    ['link', { rel: 'mask-icon', href: '/safari-pinned-tab.svg', color: '#0367e9' }],
    ['meta', { name: 'msapplication-TileColor', content: '#0367e9' }],
    ['meta', { name: 'theme-color', content: '#ffffff' }],
    ['script', { 'defer': '', 'data-domain': 'signaldb.js.org', 'src': 'https://plausible.unsou.de/js/script.js' }],
  ],

  sitemap: {
    hostname: 'https://signaldb.js.org',
    lastmodDateOnly: true,
    transformItems(items) {
      const exclude = new Set([
        '/googlef8c159020eb311c9',
        '/examples',
        '/examples/appwrite',
        '/examples/firebase',
        '/examples/replication-http',
        '/examples/supabase',
        'guides/',
        'integrations/',
      ])
      return items.filter(item => !exclude.has(item.url))
    },
  },

  buildEnd: async () => {
    const redirects = {
      '/collections.html': '/reference/core/collection/',
      '/collections/index.html': '/reference/core/collection/',
      '/core-concepts.html': '/core-concepts/',
      '/cursors.html': '/queries/',
      '/cursors/index.html': '/queries/',
      '/data-manipulation.html': '/data-manipulation/',
      '/data-persistence.html': '/data-persistence/',
      '/data-persistence/appwrite/index.html': '/sync/',
      '/data-persistence/file-system.html': '/reference/fs/',
      '/data-persistence/file-system/index.html': '/reference/fs/',
      '/data-persistence/firebase/index.html': '/sync/',
      '/data-persistence/local-storage.html': '/reference/localstorage/',
      '/data-persistence/local-storage/index.html': '/reference/localstorage/',
      '/data-persistence/opfs/index.html': '/reference/opfs/',
      '/data-persistence/other.html': '/data-persistence/',
      '/data-persistence/other/index.html': '/data-persistence/',
      '/data-persistence/rxdb/index.html': '/data-persistence/',
      '/data-persistence/supabase/index.html': '/sync/',
      '/examples/rxdb/index.html': '/sync/',
      '/getting-started.html': '/getting-started/',
      '/installation.html': '/installation/',
      '/integrations/index.html': '/guides/',
      '/integrations/react/index.html': '/guides/react/',
      '/queries.html': '/queries/',
      '/reactivity.html': '/reactivity/',
      '/reactivity/angular.html': '/reference/angular/',
      '/reactivity/angular/index.html': '/reference/angular/',
      '/reactivity/maverickjs.html': '/reference/maverickjs/',
      '/reactivity/maverickjs/index.html': '/reference/maverickjs/',
      '/reactivity/meteor-tracker.html': '/reference/meteor/',
      '/reactivity/meteor-tracker/index.html': '/reference/meteor/',
      '/reactivity/meteor/index.html': '/reference/meteor/',
      '/reactivity/mobx.html': '/reference/mobx/',
      '/reactivity/mobx/index.html': '/reference/mobx/',
      '/reactivity/oby.html': '/reference/oby/',
      '/reactivity/oby/index.html': '/reference/oby/',
      '/reactivity/other.html': '/reference/core/createreactivityadapter/',
      '/reactivity/other/index.html': '/reactivity/',
      '/reactivity/preact-signals.html': '/reference/preact/',
      '/reactivity/preact-signals/index.html': '/reference/preact/',
      '/reactivity/preact/index.html': '/reference/preact/',
      '/reactivity/reactively.html': '/reference/reactively/',
      '/reactivity/reactively/index.html': '/reference/reactively/',
      '/reactivity/s-js/index.html': '/reference/sjs/',
      '/reactivity/S.html': '/reference/sjs/',
      '/reactivity/S/index.html': '/reference/sjs/',
      '/reactivity/sinuous.html': '/reference/sinuous/',
      '/reactivity/sinuous/index.html': '/reference/sinuous/',
      '/reactivity/solidjs.html': '/reference/solid/',
      '/reactivity/solidjs/index.html': '/reference/solid/',
      '/reactivity/usignal.html': '/reference/usignal/',
      '/reactivity/usignal/index.html': '/reference/usignal/',
      '/reactivity/vue.html': '/reference/vue/',
      '/reactivity/vue/index.html': '/reference/vue/',
      '/reference/core/index.html': '/reference/',
      '/reference/core/createpersistenceadapter/index.html': '/reference/core/createstorageadapter/',
      '/replication.html': '/sync/',
      '/replication/appwrite/index.html': '/sync/',
      '/replication/firebase/index.html': '/sync/',
      '/replication/http/index.html': '/sync/',
      '/replication/index.html': '/sync/',
      '/replication/other/index.html': '/sync/',
      '/replication/rxdb.html': '/sync/',
      '/replication/rxdb/index.html': '/sync/',
      '/replication/supabase/index.html': '/sync/',
      '/sync/implementation': '/sync/',
      '/sync/reference/index.html': '/reference/sync/',
      '/todo-example/index.html': '/examples/appwrite/',
      '/troubleshooting.html': '/troubleshooting/',
    }

    for (const [from, to] of Object.entries(redirects)) {
      await fs.mkdir(path.dirname(`./docs/.vitepress/dist${from}`), { recursive: true })
      await fs.writeFile(`./docs/.vitepress/dist${from}`, buildRedirectHtml(to))
    }
  },
})
