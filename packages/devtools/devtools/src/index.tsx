import React from 'react'
import ReactDOM from 'react-dom/client'
import Root from './containers/Root'

const clientside = typeof document !== 'undefined'

/**
 * Sets up the development tools if running on the client side.
 */
function setupDevtools() {
  if (!clientside) return

  // return if devtools root already exists
  if (document.querySelector('#signaldb-devtools-root')) return

  const devtoolsRootElement = document.createElement('div')
  devtoolsRootElement.id = 'signaldb-devtools-root'
  devtoolsRootElement.style.zIndex = '1000000'
  devtoolsRootElement.style.position = 'relative'
  devtoolsRootElement.style.fontFamily = 'sans-serif'

  document.body.append(devtoolsRootElement)
  const devtoolsRoot = ReactDOM.createRoot(devtoolsRootElement)
  devtoolsRoot.render(<Root />)
}

setupDevtools()
