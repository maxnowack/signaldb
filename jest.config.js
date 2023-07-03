/* eslint-disable @typescript-eslint/no-unsafe-argument */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleDirectories: ['node_modules', 'src'],
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
    '^.+\\.ts$': 'ts-jest',
  },
}
