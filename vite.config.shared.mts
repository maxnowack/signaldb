import path from 'path'
import dts from 'vite-plugin-dts'

export const createDtsPlugin = (packageRoot: string) => dts({
  entryRoot: path.resolve(packageRoot, 'src'),
  insertTypesEntry: true,
  pathsToAliases: false,
  tsconfigPath: path.resolve(packageRoot, 'tsconfig.json'),
})
