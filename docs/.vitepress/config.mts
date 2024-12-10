import fs from 'fs/promises'
import path from 'path'
import { withMermaid } from 'vitepress-plugin-mermaid'

// https://vitepress.dev/reference/site-config
export default withMermaid({
  title: 'SignalDB',
  description: 'A reactive local JavaScript database with a MongoDB-like interface, first-class TypeScript support and signal-based reactivity.',
  lastUpdated: true,

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/getting-started/' },
    ],

    outline: {
      level: [2, 3],
    },

    sidebar: [
      {
        text: 'Quickstart',
        collapsed: false,
        items: [
          { text: 'Getting Started', link: '/getting-started/' },
          { text: 'Core Concepts', link: '/core-concepts/' },
          { text: 'Installation', link: '/installation/' },
          { text: 'Querying Data', link: '/queries/' },
          { text: 'Data manipulation', link: '/data-manipulation/' },
          { text: 'Data Persistence', link: '/data-persistence/' },
          { text: 'Sync', link: '/sync/' },
          { text: 'Implementing Sync', link: '/sync/implementation/' },
        ],
      },
      {
        text: 'Reactivity Adapters',
        collapsed: true,
        items: [
          { text: 'Overview', link: '/reactivity/' },
          { text: '@preact/signals-core', link: '/reactivity/preact-signals/' },
          { text: '@reactively/core', link: '/reactivity/reactively/' },
          { text: 'Angular', link: '/reactivity/angular/' },
          { text: 'Maverick-js Signals', link: '/reactivity/maverickjs/' },
          { text: 'Meteor Tracker', link: '/reactivity/meteor-tracker/' },
          { text: 'MobX', link: '/reactivity/mobx/' },
          { text: 'oby', link: '/reactivity/oby/' },
          { text: 'S.js', link: '/reactivity/S/' },
          { text: 'sinuous', link: '/reactivity/sinuous/' },
          { text: 'Solid.js', link: '/reactivity/solidjs/' },
          { text: 'usignal', link: '/reactivity/usignal/' },
          { text: 'Vue.js', link: '/reactivity/vue/' },
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
        text: 'Reference',
        link: '/reference/',
        collapsed: true,
        items: [
          {
            text: 'Base',
            items: [
              {
                text: '@signaldb/core',
                link: '/reference/core/',
                collapsed: true,
                items: [
                  { text: 'Collection', link: '/reference/core/collection/' },
                  { text: 'AutoFetchCollection', link: '/reference/core/autofetchcollection/' },
                  { text: 'createIndex', link: '/reference/core/createindex/' },
                  { text: 'createIndexProvider', link: '/reference/core/createindexprovider/' },
                  { text: 'createMemoryAdapter', link: '/reference/core/creatememoryadapter/' },
                  { text: 'createPersistenceAdapter', link: '/reference/core/createpersistenceadapter/' },
                  { text: 'createReactivityAdapter', link: '/reference/core/createreactivityadapter/' },
                  { text: 'combinePersistenceAdapters', link: '/reference/core/combinepersistenceadapters/' },
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
            text: 'Persistence Adapters',
            items: [
              { text: '@signaldb/fs', link: '/reference/fs/' },
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
              { text: '@signaldb/usignal', link: '/reference/usignal/' },
              { text: '@signaldb/vue', link: '/reference/vue/' },
            ],
          },
        ],
      },
      {
        text: 'Examples',
        collapsed: false,
        items: [
          { text: 'HTTP Replication', link: 'https://signaldb.js.org/examples/replication-http/' },
          { text: 'Appwrite', link: 'https://signaldb.js.org/examples/appwrite/' },
          { text: 'Firebase', link: 'https://signaldb.js.org/examples/firebase/' },
          { text: 'RxDB', link: 'https://signaldb.js.org/examples/rxdb/' },
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
    ['script', { defer: '', 'data-domain': 'signaldb.js.org', src: 'https://plausible.unsou.de/js/script.js' }],
    ['script', { async: '', 'data-uid': 'fc19a2cffc', src: 'https://maxnowack.ck.page/fc19a2cffc/index.js' }],
  ],

  sitemap: {
    hostname: 'https://signaldb.js.org',
    lastmodDateOnly: true,
    transformItems(items) {
      const exclude = [
        '/googlef8c159020eb311c9',
        '/404',
        '/examples/rxdb',
        '/examples/rxdb/404',
        '/examples/firebase',
        '/examples/firebase/404',
        '/examples/appwrite',
        '/examples/appwrite/404',
        '/examples/supabase',
        '/examples/supabase/404',
        'guides/',
        'integrations/'
      ]
      return items.filter((item) => !exclude.includes(item.url))
    },
  },

  buildEnd: async () => {
    function buildRedirectHtml(to: string) {
      return `<!DOCTYPE html><html><title>Redirecting...</title><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}"><body><a href="${to}">Redirecting...</a></body></html>`
    }

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
      '/data-persistence/other.html': '/data-persistence/other/',
      '/data-persistence/supabase/index.html': '/sync/',
      '/getting-started.html': '/getting-started/',
      '/installation.html': '/installation/',
      '/integrations/index.html': '/guides/',
      '/integrations/react/index.html': '/guides/react/',
      '/queries.html': '/queries/',
      '/reactivity.html': '/reactivity/',
      '/reactivity/angular.html': '/reactivity/angular/',
      '/reactivity/maverickjs.html': '/reactivity/maverickjs/',
      '/reactivity/meteor-tracker.html': '/reactivity/meteor-tracker/',
      '/reactivity/mobx.html': '/reactivity/mobx/',
      '/reactivity/oby.html': '/reactivity/oby/',
      '/reactivity/other.html': '/reference/core/createreactivityadapter/',
      '/reactivity/preact-signals.html': '/reactivity/preact-signals/',
      '/reactivity/reactively.html': '/reactivity/reactively/',
      '/reactivity/S.html': '/reactivity/S/',
      '/reactivity/sinuous.html': '/reactivity/sinuous/',
      '/reactivity/solidjs.html': '/reactivity/solidjs/',
      '/reactivity/usignal.html': '/reactivity/usignal/',
      '/reactivity/vue.html': '/reactivity/vue/',
      '/replication.html': '/sync/',
      '/replication/index.html': '/sync/',
      '/replication/appwrite/index.html': '/sync/',
      '/replication/firebase/index.html': '/sync/',
      '/replication/http/index.html': '/sync/',
      '/replication/other/index.html': '/sync/',
      '/replication/rxdb.html': '/sync/',
      '/replication/rxdb/index.html': '/sync/',
      '/replication/supabase/index.html': '/sync/',
      '/sync/reference/index.html': '/reference/sync/',
      '/troubleshooting.html': '/troubleshooting/',
    }

    await Object.entries(redirects).reduce(async (promise, [from, to]) => {
      await promise
      await fs.mkdir(path.dirname(`./docs/.vitepress/dist${from}`), { recursive: true })
      await fs.writeFile(`./docs/.vitepress/dist${from}`, buildRedirectHtml(to))
    }, Promise.resolve())
  },
})
