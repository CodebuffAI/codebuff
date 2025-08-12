const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

const config = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  testEnvironment: 'jest-environment-jsdom',
  testPathIgnorePatterns: ['<rootDir>/src/__tests__/e2e'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^common/(.*)$': '<rootDir>/../common/src/$1',
    '^@codebuff/internal/xml-parser$': '<rootDir>/src/test-stubs/xml-parser.ts',
  },
}

module.exports = createJestConfig(config)
