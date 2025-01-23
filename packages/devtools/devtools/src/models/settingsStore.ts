import Store from '../utils/Store'

const settingsStore = new Store({
  showButton: true,
  badgeType: 'collections',
  trackQueries: false,
  trackMutations: false,
  trackMeasurements: false,
})

if (typeof document !== 'undefined') {
  const initializeSettings = () => {
    settingsStore.patch({
      showButton: true,
      badgeType: 'collections',
      ...JSON.parse(localStorage.getItem('signaldb_devtools_settings') || '{}') as {
        showButton?: boolean,
        badgeType?: string,
        trackQueries?: boolean,
        trackMutations?: boolean,
        trackMeasurements?: boolean,
      },
    })
    settingsStore.subscribe(() => {
      localStorage.setItem('signaldb_devtools_settings', JSON.stringify(settingsStore.get()))
    })
  }

  if (['complete', 'interactive'].includes(document.readyState)) {
    initializeSettings()
  } else {
    document.addEventListener('DOMContentLoaded', initializeSettings)
  }
}

export default settingsStore
