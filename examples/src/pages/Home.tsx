import { examples } from '../examples/registry'

const Home = () => {
  return (
    <main className="examples-home">
      <h1>SignalDB Examples</h1>
      <p>Select an example to open it.</p>
      <ul>
        {Object.values(examples).map(example => (
          <li key={example.slug}>
            <a href={`/examples/${example.slug}/`}>{example.title}</a>
          </li>
        ))}
      </ul>
    </main>
  )
}

export default Home
