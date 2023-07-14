import { useMemo, useState } from 'react'
import setupCollection from '../../system/setupCollection'
import style from './style.module.scss'
import List from './List'

const App: React.FC = () => {
  const [text, setText] = useState('')
  const collection = useMemo(() => setupCollection(), [])
  return (
    <main>
      <div className={style.container}>
        <h1>Todo App</h1>
        <input
          type="text"
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (text === '') return
              collection.insert({
                text,
                completed: false,
              })
              setText('')
            }
          }}
        />
        <List collection={collection} />
      </div>
    </main>
  )
}

export default App
