import createSupabasePersistenceAdapter from '../../utils/createSupabasePersistenceAdapter'

const persistence = createSupabasePersistenceAdapter<{
  id: string,
  text: string,
  completed: boolean,
}, string>('todos')

export default persistence
