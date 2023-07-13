/* eslint-disable @typescript-eslint/no-unsafe-argument */
module.exports = {
  extensionsToTreatAsEsm: ['.ts'],
  testEnvironment: 'node',
  preset: 'ts-jest/presets/default-esm',
  moduleDirectories: ['node_modules', 'src'],
  testPathIgnorePatterns: ['./dist'],
  verbose: true,
  collectCoverageFrom: [
    'src/**/*.{js,ts}',
    '!<rootDir>/node_modules/',
  ],
  coverageThreshold: {
    global: {
      lines: 90,
      statements: 90,
    },
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      useESM: true,
    }],
  },
}
