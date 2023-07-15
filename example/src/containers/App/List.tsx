import { useEffect, useState } from 'react'
import { effect } from '@maverick-js/signals'
import type { Collection } from 'signaldb'
import style from './style.module.scss'

interface Props {
  collection: Collection<{ id: string, text: string, completed: boolean }>,
}

const List: React.FC<Props> = ({ collection }) => {
  const [items, setItems] = useState<{ id: string, text: string, completed: boolean }[]>([])
  useEffect(() => {
    effect(() => {
      setItems(collection.find({}, {
        sort: { completed: 1, text: 1 },
      }).fetch())
    })
  }, [collection])
  return (
    <ul>
      {items.map(item => (
        <li key={item.id} className={item.completed ? style.completed : ''}>
          <input
            type="checkbox"
            checked={item.completed}
            onChange={() => collection.updateOne({ id: item.id }, {
              $set: { completed: !item.completed },
            })}
          />
          <p>{item.text}</p>
          <button onClick={() => collection.removeOne({ id: item.id })}>x</button>
        </li>
      ))}
      {items.length === 0 && <li style={{ justifyContent: 'center', fontStyle: 'italic' }}>Empty</li>}
    </ul>
  )
}

export default List
