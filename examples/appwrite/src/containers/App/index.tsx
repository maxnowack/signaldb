/* eslint-disable jsdoc/require-jsdoc */
import { useState } from 'react'
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
        onChange={e => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            if (text === '') return
            Todos.insert({
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
