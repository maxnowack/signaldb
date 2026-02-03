import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import ExamplePage from './pages/ExamplePage'
import Home from './pages/Home'
import './styles/globals.scss'

const rootElement = document.getElementById('root')

if (!rootElement) {
  throw new Error('Root element not found')
}

const exampleId = document.body.dataset.example ?? 'home'

const element = exampleId === 'home'
  ? <Home />
  : <ExamplePage exampleId={exampleId} />

createRoot(rootElement).render(
  <StrictMode>
    {element}
  </StrictMode>,
)
