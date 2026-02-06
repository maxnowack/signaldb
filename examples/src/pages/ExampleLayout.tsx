import type { ReactNode } from 'react'

const ExampleLayout = ({
  title,
  codeUrl,
  children,
}: {
  title: string,
  codeUrl: string,
  children: ReactNode,
}) => {
  return (
    <main>
      <h1>{title}</h1>
      <p className="subline">
        <a href={codeUrl} target="_blank" rel="noopener">Take a look at the code</a>
        <a href="/">Back to documentation</a>
      </p>
      {children}
    </main>
  )
}

export default ExampleLayout
