import fs from 'fs/promises'
import path from 'path'
import { defineConfig } from 'vitepress'
import { generateSitemap as sitemap } from 'sitemap-ts'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: 'SignalDB',
  description: 'A reactive local JavaScript database with a MongoDB-like interface, first-class TypeScript support and signal-based reactivity.',
  lastUpdated: true,

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/getting-started/' },
    ],

    sidebar: [
      {
        text: 'Quickstart',
        collapsed: false,
        items: [
          { text: 'Core Concepts', link: '/core-concepts/' },
          { text: 'Getting Started', link: '/getting-started/' },
          { text: 'Installation', link: '/installation/' },
        ],
      },
      {
        text: 'Examples',
        collapsed: false,
        items: [
          { text: 'RxDB', link: 'https://signaldb.js.org/examples/rxdb/' },
          { text: 'Firebase', link: 'https://signaldb.js.org/examples/firebase/' },
          { text: 'Appwrite', link: 'https://signaldb.js.org/examples/appwrite/' },
        ],
      },
      {
        text: 'Documentation',
        collapsed: false,
        items: [
          { text: 'Collections', link: '/collections/' },
          { text: 'Queries', link: '/queries/' },
          { text: 'Cursors', link: '/cursors/' },
          { text: 'Data manipulation', link: '/data-manipulation/' },
        ],
      },
      {
        text: 'Reactivity',
        collapsed: false,
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
          { text: 'Other libraries', link: '/reactivity/other/' },
        ],
      },
      {
        text: 'Data Persistence',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/data-persistence/' },
          { text: 'localStorage', link: '/data-persistence/local-storage/' },
          { text: 'Filesystem', link: '/data-persistence/file-system/' },
          { text: 'RxDB', link: '/data-persistence/rxdb/' },
          { text: 'Firebase', link: '/data-persistence/firebase/' },
          { text: 'Appwrite', link: '/data-persistence/appwrite/' },
          { text: 'Other Persistence Options', link: '/data-persistence/other/' },
        ],
      },
      {
        text: 'Replication (coming soon)',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/replication/' },
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
          { text: 'Optimistic UI', link: '/optimistic-ui/' },
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
  ],

  buildEnd: async () => {
    sitemap({
      hostname: 'https://signaldb.js.org',
      outDir: './docs/.vitepress/dist',
      exclude: [
        '/googlef8c159020eb311c9',
        '/404',
        '/examples/rxdb',
        '/examples/rxdb/404',
        '/examples/firebase',
        '/examples/firebase/404',
        '/examples/appwrite',
        '/examples/appwrite/404',
      ],
    })

    await new Promise((resolve) => { setTimeout(resolve, 1000) }) // wait a second for the sitemap to be generated
    await fs.writeFile('./docs/.vitepress/dist/sitemap.xml', (await fs.readFile('./docs/.vitepress/dist/sitemap.xml', 'utf-8'))
      .replace(/<loc>([a-z0-9:/.-]+?\w)<\/loc>/g, '<loc>$1/</loc>')) // add trailing slash to all urls

    function buildRedirectHtml(to: string) {
      return `<!DOCTYPE html><html><title>Redirecting...</title><meta http-equiv="refresh" content="0; url=${to}"><link rel="canonical" href="${to}"><body><a href="${to}">Redirecting...</a></body></html>`
    }

    const redirects = {
      '/collections.html': '/collections/',
      '/core-concepts.html': '/core-concepts/',
      '/cursors.html': '/cursors/',
      '/data-manipulation.html': '/data-manipulation/',
      '/data-persistence.html': '/data-persistence/',
      '/getting-started.html': '/getting-started/',
      '/installation.html': '/installation/',
      '/queries.html': '/queries/',
      '/reactivity.html': '/reactivity/',
      '/replication.html': '/replication/',
      '/troubleshooting.html': '/troubleshooting/',
      '/data-persistence/file-system.html': '/data-persistence/file-system/',
      '/data-persistence/local-storage.html': '/data-persistence/local-storage/',
      '/data-persistence/other.html': '/data-persistence/other/',
      '/reactivity/S.html': '/reactivity/S/',
      '/reactivity/angular.html': '/reactivity/angular/',
      '/reactivity/maverickjs.html': '/reactivity/maverickjs/',
      '/reactivity/meteor-tracker.html': '/reactivity/meteor-tracker/',
      '/reactivity/mobx.html': '/reactivity/mobx/',
      '/reactivity/oby.html': '/reactivity/oby/',
      '/reactivity/other.html': '/reactivity/other/',
      '/reactivity/preact-signals.html': '/reactivity/preact-signals/',
      '/reactivity/reactively.html': '/reactivity/reactively/',
      '/reactivity/sinuous.html': '/reactivity/sinuous/',
      '/reactivity/solidjs.html': '/reactivity/solidjs/',
      '/reactivity/usignal.html': '/reactivity/usignal/',
      '/reactivity/vue.html': '/reactivity/vue/',
      '/replication/rxdb.html': '/data-persistence/rxdb/',
      '/replication/rxdb/index.html': '/data-persistence/rxdb/',
    }

    Object.entries(redirects).reduce(async (promise, [from, to]) => {
      await promise
      const dir = path.dirname(`./docs/.vitepress/dist${from}`)
      await fs.mkdir(dir, { recursive: true })
      await fs.writeFile(`./docs/.vitepress/dist${from}`, buildRedirectHtml(to))
    }, Promise.resolve())
  },
})
