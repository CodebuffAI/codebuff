module.exports = {
  parser: '@typescript-eslint/parser',
  settings: {
    react: {
      version: 'detect',
    },
  },
  plugins: ['lodash', 'unused-imports'],
  extends: [
    'next/core-web-vitals',
    'plugin:@typescript-eslint/recommended',
    'plugin:react-hooks/recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:@next/next/recommended',
    'prettier',
  ],
  rules: {
    'react/display-name': 'off',
    'react/no-unescaped-entities': 'off',
    'react/jsx-no-target-blank': 'off',
    'react/no-unstable-nested-components': ['error', { allowAsProps: true }],
    '@typescript-eslint/no-empty-function': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        caughtErrorsIgnorePattern: '^_',
      },
    ],
    '@next/next/no-img-element': 'off',
    'linebreak-style': [
      'error',
      process.platform === 'win32' ? 'windows' : 'unix',
    ],
    'lodash/import-scope': [2, 'member'],
    'unused-imports/no-unused-imports': 'warn',
    'react-hooks/exhaustive-deps': 'off',
    'no-constant-condition': 'off',
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@amplitude/analytics-browser',
            importNames: ['track'],
            message:
              'Please import track from `web/lib/service/analytics` instead',
          },
        ],
      },
    ],
  },
  ignorePatterns: ['/public/mtg/*'],
  env: {
    browser: true,
    node: true,
  },
}
