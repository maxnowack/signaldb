'use client'

import dynamic from 'next/dynamic'
/* eslint-disable jsdoc/require-jsdoc */

const App = dynamic(() => import('../containers/App'), { ssr: false })

export default function Home() {
  return <App />
}
