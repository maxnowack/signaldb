import createFirebasePersistenceAdapter from '../../utils/createFirebasePersistenceAdapter'

const persistence = createFirebasePersistenceAdapter<{
  id: string,
  text: string,
  completed: boolean,
}, string>('todos')

export default persistence
