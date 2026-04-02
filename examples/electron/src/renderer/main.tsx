import { createRoot } from 'react-dom/client'
import App from './containers/App'

// eslint-disable-next-line @typescript-eslint/no-non-null-assertion
createRoot(document.querySelector('#root')!).render(<App />)
