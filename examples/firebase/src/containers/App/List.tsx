import Todos from '../../models/Todos'
import useReactivity from '../../utils/useReactivity'

const List: React.FC = () => {
  const items = useReactivity(() => Todos.find({}, {
    sort: { completed: 1, text: 1 },
  }).fetch(), [])
  return (
    <ul>
      {items.map(item => (
        <li key={item.id} className={item.completed ? 'completed' : ''}>
          <input
            type="checkbox"
            checked={item.completed}
            onChange={() => {
              void Todos.updateOne({ id: item.id }, {
                $set: { completed: !item.completed },
              })
            }}
          />
          <p>{item.text}</p>
          <button
            onClick={() => {
              void Todos.removeOne({ id: item.id })
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

export default List
