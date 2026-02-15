import '@signaldb/devtools'
import TodoApp from '../../shared/TodoApp'
import Todos from './models/Todos'

const FirebaseExample = () => {
  return <TodoApp collection={Todos} />
}

export default FirebaseExample
