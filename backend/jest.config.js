module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json', 'node'],
  globals: {
    'ts-jest': {
      tsconfig: 'tsconfig.json',
    },
  },
  moduleNameMapper: {
    '^common(.*)$': '<rootDir>/../common/src$1',
  },
  moduleDirectories: ['node_modules', '../node_modules'],
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'], // Add this line to include the setup file
};
