import { examples } from '../examples/registry'
import ExampleLayout from './ExampleLayout'

const ExamplePage = ({ exampleId }: { exampleId: string }) => {
  const key = exampleId as keyof typeof examples
  const example = examples[key]

  if (!example) {
    return (
      <main>
        <h1>Example not found</h1>
        <p className="subline">
          <a href="/examples/">Back to examples</a>
          <a href="/">Back to documentation</a>
        </p>
      </main>
    )
  }

  const Component = example.component

  return (
    <ExampleLayout title={example.heading} codeUrl={example.codeUrl}>
      <Component />
    </ExampleLayout>
  )
}

export default ExamplePage
