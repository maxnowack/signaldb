import fs from 'fs/promises'
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
      { text: 'Example', link: 'https://signaldb.js.org/todo-example/' },
      {
        text: 'Documentation',
        collapsed: false,
        items: [
          { text: 'Collections', link: '/collections/' },
          { text: 'Queries', link: '/queries/' },
          { text: 'Data manipulation', link: '/data-manipulation/' },
        ],
      },
      {
        text: 'Reactivity',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/reactivity/' },
          { text: '@preact/signals-core', link: '/reactivity/preact-signals/' },
          { text: 'Solid Signals', link: '/reactivity/solidjs/' },
          { text: 'Maverick-js Signals', link: '/reactivity/maverickjs/' },
          { text: 'Meteor Tracker', link: '/reactivity/meteor-tracker/' },
          { text: 'oby', link: '/reactivity/oby/' },
          { text: 'usignal', link: '/reactivity/usignal/' },
          { text: 'sinuous', link: '/reactivity/sinuous/' },
          { text: '@reactively/core', link: '/reactivity/reactively/' },
          { text: 'S.js', link: '/reactivity/S/' },
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
          { text: 'Other Persistence Options', link: '/data-persistence/other/' },
        ],
      },
      {
        text: 'Replication (coming soon)',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/replication/' },
          { text: 'RxDB Persistence adapter', link: '/replication/rxdb/' },
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

  head: [
    ['link', { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' }],
    ['link', { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' }],
    ['link', { rel: 'manifest', href: '/site.webmanifest' }],
    ['link', { rel: 'mask-icon', href: '/safari-pinned-tab.svg', color: '#0367e9' }],
    ['meta', { name: 'msapplication-TileColor', content: '#0367e9' }],
    ['meta', { name: 'theme-color', content: '#ffffff' }],
  ],

  buildEnd: async () => {
    sitemap({
      hostname: 'https://signaldb.js.org',
      outDir: './docs/.vitepress/dist',
      exclude: ['/googlef8c159020eb311c9', '/404', '/todo-example', '/todo-example/404'],
    })

    await new Promise((resolve) => { setTimeout(resolve, 1000) }) // wait a second for the sitemap to be generated
    await fs.writeFile('./docs/.vitepress/dist/sitemap.xml', (await fs.readFile('./docs/.vitepress/dist/sitemap.xml', 'utf-8'))
      .replace(/<loc>([a-z0-9:/.-]+?\w)<\/loc>/g, '<loc>$1/</loc>')) // add trailing slash to all urls
  },
})
