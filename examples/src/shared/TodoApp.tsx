import { useState } from 'react'
import type { TodoCollection } from './types'
import TodoList from './TodoList'

const TodoApp = ({ collection }: { collection: TodoCollection }) => {
  const [text, setText] = useState('')

  return (
    <>
      <input
        type="text"
        value={text}
        placeholder="Type and press Enter to add a new item …"
        onChange={event => setText(event.target.value)}
        onKeyDown={(event) => {
          if (text === '' || event.key !== 'Enter') return
          void collection.insert({
            text,
            completed: false,
          })
          setText('')
        }}
      />
      <TodoList collection={collection} />
    </>
  )
}

export default TodoApp
