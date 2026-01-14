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
    '^@codebuff/internal/env$': '<rootDir>/../packages/internal/src/env.ts',
    '^@codebuff/internal/xml-parser$': '<rootDir>/src/test-stubs/xml-parser.ts',
    '^bun:test$': '<rootDir>/src/test-stubs/bun-test.ts',
    '^react$': '<rootDir>/node_modules/react',
    '^react-dom$': '<rootDir>/node_modules/react-dom',
  },
  testPathIgnorePatterns: [
    '<rootDir>/src/__tests__/e2e',
    '<rootDir>/src/__tests__/playwright-runner.test.ts',
    '<rootDir>/src/lib/__tests__/ban-conditions.test.ts',
    '<rootDir>/src/app/api/v1/.*/__tests__',
    '<rootDir>/src/app/api/agents/publish/__tests__',
  ],
}

module.exports = createJestConfig(config)
