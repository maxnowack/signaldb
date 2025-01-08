'use client'

import dynamic from 'next/dynamic'

const App = dynamic(() => import('../containers/App'), { ssr: false })

const Home = () => {
  return <App />
}

export default Home
