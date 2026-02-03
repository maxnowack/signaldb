import '@signaldb/devtools'
import TodoApp from '../../shared/TodoApp'
import Todos from './models/Todos'

const AppwriteExample = () => {
  return <TodoApp collection={Todos} />
}

export default AppwriteExample
