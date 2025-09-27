import { useState } from 'react'
import '@signaldb/devtools'
import Todos from '../../models/Todos'
import List from './List'

const App: React.FC = () => {
  const [text, setText] = useState('')
  return (
    <>
      <input
        type="text"
        value={text}
        placeholder="Type and press Enter to add a new item …"
        onChange={event => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            if (text === '') return
            void Todos.insert({
              text,
              completed: false,
            })
            setText('')
          }
        }}
      />
      <List />
    </>
  )
}

export default App
