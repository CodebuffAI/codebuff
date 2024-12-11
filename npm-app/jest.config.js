/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^common/(.*)$': '<rootDir>/../common/src/$1',
    '^code-map/(.*)$': '<rootDir>/../packages/code-map/$1'
  },
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true
}
