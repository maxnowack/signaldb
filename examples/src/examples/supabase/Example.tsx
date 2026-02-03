import '@signaldb/devtools'
import TodoApp from '../../shared/TodoApp'
import Todos from './models/Todos'

const SupabaseExample = () => {
  return <TodoApp collection={Todos} />
}

export default SupabaseExample
