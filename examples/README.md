# SignalDB Examples (Vite)

This folder contains the example apps bundled into a single Vite build with multiple pages.

## Development

```bash
npm run dev -w examples
```

Open:
- `http://localhost:5173/examples/` (index)
- `http://localhost:5173/examples/replication-http/`
- `http://localhost:5173/examples/appwrite/`
- `http://localhost:5173/examples/firebase/`
- `http://localhost:5173/examples/supabase/`

## Build for docs

```bash
npm run build -w examples
npm run copy -w examples
```

This copies the built files into `docs/public/examples`.

## Adding examples from other frameworks

The examples app is a single Vite build with multiple pages. To add examples from other frameworks (Vue, Svelte, Solid, etc.) without splitting the app, use Web Components.

Recommended approach:

1) Create a custom element for the framework example (Vue `defineCustomElement`, Svelte `customElement: true`, Solid `solid-element` or a custom element helper).
2) Register the element in a React page component and render it as a normal HTML tag.
3) Add a new HTML entry and wire it into `vite.config.ts` + `src/examples/registry.ts`.

Minimal file structure:

```
examples/
  my-framework/
    index.html
  src/
    examples/
      my-framework/
        element.ts
        Example.tsx
```

Required wiring:

- `examples/vite.config.ts`: add `myFramework: resolvePath('my-framework/index.html')` to `build.rollupOptions.input`.
- `examples/src/examples/registry.ts`: add the new example metadata (slug, title, heading, codeUrl, component).

Example page pattern (React wrapper):

```tsx
// examples/src/examples/my-framework/Example.tsx
import { useEffect } from 'react'
import '../../shared/yourStyles.scss'

const MyFrameworkExample = () => {
  useEffect(() => {
    void import('./element')
  }, [])

  return <my-framework-example />
}

export default MyFrameworkExample
```
