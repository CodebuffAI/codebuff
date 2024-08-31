module.exports = {
  plugins: ['lodash', 'unused-imports'],
  extends: ['eslint:recommended'],
  ignorePatterns: ['dist', 'lib'],
  env: {
    node: true,
  },
  overrides: [
    {
      files: ['**/*.ts'],
      plugins: ['@typescript-eslint'],
      extends: ['plugin:@typescript-eslint/recommended', 'prettier'],
      parser: '@typescript-eslint/parser',
      parserOptions: {
        tsconfigRootDir: __dirname,
        project: ['./tsconfig.json'],
      },
      rules: {
        '@typescript-eslint/ban-types': [
          'error',
          {
            extendDefaults: true,
            types: {
              '{}': false,
            },
          },
        ],
        '@typescript-eslint/no-explicit-any': 'off',
        '@typescript-eslint/no-extra-semi': 'off',
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
    'linebreak-style': [
      'error',
      process.platform === 'win32' ? 'windows' : 'unix',
    ],
    'lodash/import-scope': [2, 'member'],
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: 'openai',
            importNames: ['APIError'],
            message:
              'Please import APIError from `api/helpers/endpoint` instead',
          },
          {
            name: 'openai/error',
            importNames: ['APIError'],
            message:
              'Please import APIError from `api/helpers/endpoint` instead',
          },
        ],
      },
    ],
  },
}
