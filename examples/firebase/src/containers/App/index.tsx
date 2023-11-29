import { useMemo, useState } from 'react'
import setupCollection from '../../system/setupCollection'
import List from './List'

const App: React.FC = () => {
  const [text, setText] = useState('')
  const collection = useMemo(() => typeof window !== 'undefined' && setupCollection(), [])
  return (
    <>
      <input
        type="text"
        value={text}
        placeholder="Type and press Enter to add a new item …"
        onChange={e => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (text === '' || !collection) return
            collection.insert({
              text,
              completed: false,
            })
            setText('')
          }
        }}
      />
      {collection && <List collection={collection} />}
    </>
  )
}

export default App
