/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('fs')
const path = require('path')
const fg = require('fast-glob')
const { workspaces } = require('./package.json')

const projectDirs = workspaces
  .flatMap(pattern => fg.sync(pattern, { onlyDirectories: true }))
  .filter(projectPath => fs.existsSync(path.join(__dirname, projectPath, 'package.json')))

module.exports = {
  extends: [
    'airbnb-base',
    'plugin:@typescript-eslint/eslint-recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:@typescript-eslint/recommended',
    'plugin:vitest/legacy-recommended',
    'plugin:jsdoc/recommended-typescript',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    allowImportExportEverywhere: true,
    project: './tsconfig.eslint.json',
  },
  plugins: [
    '@stylistic',
    '@typescript-eslint',
    'jsdoc',
    'prefer-object-spread',
    'vitest',
  ],
  ignorePatterns: [
    'dist',
    'node_modules',
    'coverage',
    'docs/.vitepress/dist',
    'docs/public/examples',
    'examples/*/.next',
    'examples/*/out',
    'examples/*/node_modules',
  ],
  settings: {
    'import/resolver': {
      typescript: {
        project: './tsconfig.json',
      },
      node: {
        extensions: ['.js', '.ts', '.mjs', '.mts', '.cjs', '.json'],
      },
    },
    'import/extensions': [
      '.ts',
      '.mts',
    ],
  },
  env: {
    commonjs: true,
    node: true,
  },
  overrides: [
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
          packageDir: [__dirname, path.join(__dirname, projectDir)],
        }],
      },
    })),
  ],
  rules: {
    'jsdoc/require-jsdoc': ['error', {
      publicOnly: true,
      require: {
        ArrowFunctionExpression: true,
        ClassDeclaration: true,
        ClassExpression: true,
        FunctionDeclaration: true,
        FunctionExpression: true,
        MethodDefinition: true,
      },
    }],
    /*
     * Typescript
     */
    '@typescript-eslint/no-non-null-assertion': 'error',
    '@typescript-eslint/consistent-type-imports': ['error', {
      prefer: 'type-imports',
    }],
    'no-void': ['error', {
      allowAsStatement: true,
    }],
    '@stylistic/indent': ['error', 2],
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': ['error'],
    'import/extensions': 'off',
    'import/no-cycle': ['error', {
      maxDepth: 1,
    }],
    '@typescript-eslint/restrict-template-expressions': ['error', {
      allowNullish: true,
    }],
    '@typescript-eslint/no-unsafe-member-access': 'off',
    '@typescript-eslint/no-unsafe-return': 'off',
    '@typescript-eslint/no-unsafe-assignment': 'off',
    '@typescript-eslint/no-unsafe-call': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
    '@typescript-eslint/unbound-method': 'off',
    '@typescript-eslint/no-use-before-define': ['error', {
      functions: false,
    }],
    '@stylistic/member-delimiter-style': ['error', {
      multiline: {
        delimiter: 'comma',
        requireLast: true,
      },
      singleline: {
        delimiter: 'comma',
        requireLast: false,
      },
    }],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': ['error', {
      vars: 'all',
      args: 'after-used',
      ignoreRestSiblings: true,
    }],
    /*
     * Airbnb
     */
    // Overrides
    'lines-between-class-members': ['error', 'always', {
      exceptAfterSingleLine: true,
    }],
    'import/no-extraneous-dependencies': ['error', {
      devDependencies: [
        '.eslintrc.js',
        '**/*.test.ts',
        '**/*.spec.ts',
        '__tests__/**/*.ts',
        '*.config.ts',
        'docs/.vitepress/config.ts',
        'vite.config.mts',
        'vitest.config.mts',
      ],
    }],
    'arrow-parens': ['error', 'as-needed', {
      requireForBlockBody: true,
    }],
    'func-names': 'error',
    // Changed from 'warn' to 'error'.
    'import/no-absolute-path': 'off',
    // Turned off because we use absolute paths instead of '../'.
    'implicit-arrow-linebreak': 'off',
    // Turned of because of bullshit
    'no-alert': 'error',
    // Changed from 'warn' to 'error'.
    'no-console': 'error',
    // Changed from 'warn' to 'error'.
    'no-constant-condition': 'error',
    // Changed from 'warn' to 'error'.
    'no-underscore-dangle': ['error', {
      // Make some exceptions for often used fields
      allow: ['_id', '_aggregated', '_details'],
    }],
    semi: ['error', 'never'],
    // Changed from 'always' to 'never', because we never use semicolons.
    // Additions
    'no-warning-comments': 'warn',
    'import/order': ['error', {
      groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
      'newlines-between': 'never',
    }],
    /*
     * Extentions
     */
    'no-use-before-define': ['off'],
    'object-curly-newline': 'off',
    'max-len': [2, {
      code: 100,
      ignoreComments: true,
      ignoreUrls: true,
      ignoreTemplateLiterals: true,
      ignoreStrings: true,
      ignorePattern: "u\\s*\\(\\s*(['\"])(.*?)\\1\\s*,\\s*.*?\\s*,?\\s*(['\"])(.*?)\\3,?.*?\\)",
    }],
    'prefer-object-spread/prefer-object-spread': 'error',
    'object-shorthand': ['error', 'always'],
    'no-restricted-syntax': 'off',
  },
}
