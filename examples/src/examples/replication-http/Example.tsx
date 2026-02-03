import '@signaldb/devtools'
import TodoApp from '../../shared/TodoApp'
import Todos from './models/Todos'

const ReplicationHttpExample = () => {
  return <TodoApp collection={Todos} />
}

export default ReplicationHttpExample
