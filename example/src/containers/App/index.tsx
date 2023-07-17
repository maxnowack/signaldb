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
        <h1>SignalDB Example - Todo App</h1>
        <p className={style.subline}>
          <a href="https://github.com/maxnowack/signaldb/tree/main/example/src/containers/App/index.tsx" target="_blank" rel="noopener">Take a look a the code</a>
        </p>
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
