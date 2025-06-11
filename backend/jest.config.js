/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }],
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  moduleNameMapper: {
    '^common(.*)$': '<rootDir>/../common/src$1',
    '^@/env$': '<rootDir>/../env.ts',
  },
  moduleDirectories: ['node_modules', '../node_modules'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};