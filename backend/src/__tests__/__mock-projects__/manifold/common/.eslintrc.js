module.exports = {
  plugins: ['lodash', 'unused-imports'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['lib'],
  env: {
    browser: true,
    node: true,
    es6: true,
  },
  overrides: [
    {
      files: ['**/*.ts'],
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
      },
      rules: {
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-unused-vars': [
          'warn',
          {
            argsIgnorePattern: '^_',
            varsIgnorePattern: '^_',
            caughtErrorsIgnorePattern: '^_',
          },
        ],
        'unused-imports/no-unused-imports': 'warn',
        'no-constant-condition': 'off',
      },
    },
  ],
  rules: {
    'no-extra-semi': 'off',
    'no-constant-condition': ['error', { checkLoops: false }],
    'linebreak-style': [
      'error',
      process.platform === 'win32' ? 'windows' : 'unix',
    ],
    'lodash/import-scope': [2, 'member'],
  },
}
