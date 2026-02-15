import type { TodoCollection } from './types'
import useReactivity from './useReactivity'

const TodoList = ({ collection }: { collection: TodoCollection }) => {
  const items = useReactivity(
    () => collection.find({}, {
      sort: { completed: 1, text: 1 },
    }).fetch(),
    [],
  )

  return (
    <ul>
      {items.map(item => (
        <li key={item.id} className={item.completed ? 'completed' : ''}>
          <input
            type="checkbox"
            checked={item.completed}
            onChange={() => {
              void collection.updateOne({ id: item.id }, {
                $set: { completed: !item.completed },
              })
            }}
          />
          <p>{item.text}</p>
          <button
            onClick={() => {
              void collection.removeOne({ id: item.id })
            }}
          >
            x
          </button>
        </li>
      ))}
      {items.length === 0 && <li className="empty">Empty</li>}
    </ul>
  )
}

export default TodoList
