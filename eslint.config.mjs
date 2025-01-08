/* eslint-disable @typescript-eslint/no-unsafe-argument */
import eslint from '@eslint/js'
import globals from 'globals'
import tseslint, { configs as tseslintConfigs } from 'typescript-eslint'
import reactPlugin from 'eslint-plugin-react'
import jsxA11yPlugin from 'eslint-plugin-jsx-a11y'
import { flatConfigs as importPlugin } from 'eslint-plugin-import'
import testingLibraryPlugin from 'eslint-plugin-testing-library'
import jsdocPlugin from 'eslint-plugin-jsdoc'
import vitestPlugin from 'eslint-plugin-vitest'
import stylisticPlugin from '@stylistic/eslint-plugin'
import FastGlob from 'fast-glob'
import fs from 'fs'
import path from 'path'

const { workspaces } = JSON.parse(fs.readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))
const projectDirs = workspaces
  .flatMap(pattern => FastGlob.sync(pattern, { onlyDirectories: true }))
  .filter(projectPath => fs.existsSync(path.join(import.meta.url, projectPath, 'package.json')))

export default tseslint.config(
  eslint.configs.recommended,
  tseslintConfigs.recommendedTypeChecked,
  importPlugin.recommended,
  stylisticPlugin.configs['recommended-flat'],
  jsdocPlugin.configs['flat/recommended-typescript'],
  vitestPlugin.configs.recommended,
  {
    plugins: {
      'react': reactPlugin,
      'jsx-a11y': jsxA11yPlugin,
      '@stylistic': stylisticPlugin,
    },
    linterOptions: {
      reportUnusedDisableDirectives: 'error',
    },
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      parserOptions: {
        project: './tsconfig.eslint.json',
        allowImportExportEverywhere: true,
      },
    },
    settings: {
      'react': {
        version: 'detect',
      },
      'import/resolver': {
        typescript: {
          project: './tsconfig.json',
        },
        node: {
          extensions: ['.ts', '.mts', '.tsx', '.json'],
        },
      },
      'import/extensions': ['.js', '.cjs', '.mjs', '.ts', '.mts', '.tsx'],
    },
    rules: {
      'no-console': 'error',
      '@stylistic/quotes': ['error', 'single', { avoidEscape: true }],
      '@stylistic/indent-binary-ops': ['off'], // disabled until this issue was resolved: https://github.com/eslint-stylistic/eslint-stylistic/issues/546
      '@stylistic/brace-style': ['error', '1tbs'],
      'import/no-named-as-default-member': 'off',
      'semi': ['error', 'never'],
      'quotes': ['error', 'single', { avoidEscape: true }],
      'import/no-named-as-default': 'off',
      'no-restricted-exports': ['error', {
        restrictedNamedExports: [],
        restrictDefaultExports: {
          direct: false,
          named: false,
          defaultFrom: false,
          namedFrom: false,
          namespaceFrom: false,
        },
      }],
      '@typescript-eslint/no-non-null-assertion': 'error',
      '@typescript-eslint/no-deprecated': 'error',
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      'no-void': ['error', { allowAsStatement: true }],
      '@stylistic/indent': ['error', 2],
      'no-shadow': 'off',
      '@typescript-eslint/no-shadow': ['error'],
      'import/extensions': 'off',
      'import/no-cycle': ['error', { maxDepth: 1, allowUnsafeDynamicCyclicDependency: true }],
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNullish: true }],
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-return': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
      '@typescript-eslint/explicit-module-boundary-types': 'off',
      '@typescript-eslint/unbound-method': 'off',
      '@typescript-eslint/no-use-before-define': ['error', { functions: false }],
      '@stylistic/member-delimiter-style': ['error', {
        multiline: { delimiter: 'comma', requireLast: true },
        singleline: { delimiter: 'comma', requireLast: false },
      }],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': ['error', {
        vars: 'all',
        args: 'after-used',
        ignoreRestSiblings: true,
      }],
      'react/jsx-key': 'error',
      'lines-between-class-members': ['error', 'always', { exceptAfterSingleLine: true }],
      'react/function-component-definition': ['error', {
        namedComponents: 'arrow-function',
        unnamedComponents: 'arrow-function',
      }],
      'arrow-parens': ['error', 'as-needed', { requireForBlockBody: true }],
      'prefer-object-spread': 'error',
      'object-shorthand': ['error', 'always'],
    },
  },
  {
    files: ['**/__tests__/**/*.(m)[jt]s?(x)', '**/?(*.)+(spec|test).(m)[jt]s?(x)'],
    plugins: {
      'testing-library': testingLibraryPlugin,
    },
  },
  {
    ignores: [
      '**/.next/**',
      '**/dist**',
      '**/node_modules/**',
      'coverage',
      'docs/.vitepress/cache',
      'docs/.vitepress/dist',
      'docs/public',
      'examples/**/_next/**',
      'examples/**/out/**',
    ],
  },
  { files: ['commitlint.config.js'], languageOptions: { globals: globals.node } },
  { files: ['**/next.config.js'], languageOptions: { globals: globals.commonjs } },
  // https://github.com/import-js/eslint-plugin-import/issues/1913#issuecomment-1034025709
  ...projectDirs.map(projectDir => ({
    files: [`${projectDir}/**/*.{t,j}s`, `${projectDir}/**/*.m{t,j}s`],
    rules: {
      'import/no-extraneous-dependencies': ['error', {
        devDependencies: [
          '.eslintrc.js',
          '**/*.test.ts',
          '**/*.spec.ts',
          '__tests__/**/*.ts',
          '*.config.ts',
          '*.config.mts',
          'docs/.vitepress/config.ts',
          '**/vite.config.mts',
          '**/vitest.config.mts',
        ],
        packageDir: [import.meta.url, path.join(import.meta.url, projectDir)],
      }],
    },
  })),
)
