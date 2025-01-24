module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleNameMapper: {
    '^common/(.*)$': '<rootDir>/../common/src/$1',
    '^code-map/(.*)$': '<rootDir>/../packages/code-map/$1'
  },
  roots: ['<rootDir>/src'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  },
  testRegex: '(/__tests__/.*|(\\.|/)(test|spec))\\.tsx?$',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  testTimeout: 30000,
  forceExit: true,
  detectOpenHandles: true,
  // Add transformIgnorePatterns to exclude tree-sitter
  transformIgnorePatterns: [
    '/node_modules/(?!tree-sitter).+\\.js$'
  ],
  // Add modulePathIgnorePatterns to exclude tree-sitter
  modulePathIgnorePatterns: [
    '<rootDir>/node_modules/tree-sitter'
  ]
}
