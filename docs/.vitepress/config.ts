import { defineConfig } from 'vitepress'

// https://vitepress.dev/reference/site-config
export default defineConfig({
  title: "SignalDB",
  description: "Documentation",

  themeConfig: {
    // https://vitepress.dev/reference/default-theme-config
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Get Started', link: '/getting-started' }
    ],

    sidebar: [
      {
        text: 'Quickstart',
        collapsed: false,
        items: [
          { text: 'Core Concepts', link: '/core-concepts' },
          { text: 'Getting Started', link: '/getting-started' },
          { text: 'Installation', link: '/installation' },
        ]
      },
      {
        text: 'Documentation',
        collapsed: false,
        items: [
          { text: 'Collections', link: '/collections' },
          { text: 'Queries', link: '/queries' },
          { text: 'Data manipulation', link: '/data-manipulation' },
        ],
      },
      {
        text: 'Reactivity',
        collapsed: false,
        items: [
          { text: '@preact/signals-core', link: '/reactivity/preact-signals' },
          { text: 'Solid Signals', link: '/reactivity/solidjs' },
          { text: 'Maverick-js Signals', link: '/reactivity/maverickjs' },
          { text: 'Meteor Tracker', link: '/reactivity/meteor-tracker' },
          { text: 'oby', link: '/reactivity/oby' },
          { text: 'usignal', link: '/reactivity/usignal' },
          { text: 'sinuous', link: '/reactivity/sinuous' },
          { text: 'Other libraries', link: '/reactivity/other' },
        ],
      },
      {
        text: 'Data Persistence',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/data-persistence/' },
          { text: 'localStorage', link: '/data-persistence/local-storage' },
          { text: 'Other Persistence Options', link: '/data-persistence/other' },
        ],
      },
      {
        text: 'Replication (coming soon)',
        collapsed: false,
        items: [
          { text: 'Overview', link: '/replication/' },
          { text: 'RxDB Persistence Interface', link: '/replication/rxdb' },
        ],
      },
      {
        text: 'Help',
        collapsed: false,
        items: [
          { text: 'Troubleshooting', link: '/troubleshooting' },
          { text: 'Github Issues', link: 'https://github.com/maxnowack/signaldb/issues' },
        ],
      }
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/maxnowack/signaldb' }
    ]
  }
})
