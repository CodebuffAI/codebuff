module.exports = {
  parser: '@typescript-eslint/parser',
  extends: [
    'next/core-web-vitals',
    'prettier',
    'eslint:recommended',
    'plugin:prettier/recommended',
    'plugin:@typescript-eslint/recommended',
    // 'plugin:tailwindcss/recommended',
  ],
  plugins: ['prettier', '@typescript-eslint'],
  rules: {
    'prettier/prettier': [
      'warn',
      {
        endOfLine: 'auto',
      },
    ],
    'sort-imports': 'off',
    'tailwindcss/no-custom-classname': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    'react/no-unescaped-entities': 'off',
    // Prevent using CODEBUFF_API_KEY in web - users must provide their own API key
    // This prevents accidentally using Codebuff's credits for user operations
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[property.name='CODEBUFF_API_KEY']",
        message: 'CODEBUFF_API_KEY is not allowed in web package. Users must provide their own API key via Authorization header.',
      },
    ],
    // Enforce using webEnv instead of env in web package
    // webEnv omits CODEBUFF_API_KEY for type-level protection
    'no-restricted-imports': [
      'error',
      {
        paths: [
          {
            name: '@codebuff/internal/env',
            importNames: ['env'],
            message: "Use 'webEnv' instead of 'env' in web package. webEnv omits CODEBUFF_API_KEY for security.",
          },
        ],
      },
    ],
  },
  settings: {
    tailwindcss: {
      callees: ['cn'],
      config: 'tailwind.config.js',
    },
  },
}
