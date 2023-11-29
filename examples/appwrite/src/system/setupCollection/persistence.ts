import createAppwritePersistenceAdapter from '../../utils/createAppwritePersistenceAdapter'

const persistence = createAppwritePersistenceAdapter<{
  id: string,
  text: string,
  completed: boolean,
}, string>('todos')

export default persistence
