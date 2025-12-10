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
    // Prevent using process.env.CODEBUFF_API_KEY in web - users must provide their own API key
    // This prevents accidentally using Codebuff's credits for user operations
    // Note: env.CODEBUFF_API_KEY is already a TypeScript error (not in schema)
    'no-restricted-syntax': [
      'error',
      {
        selector: "MemberExpression[object.object.name='process'][object.property.name='env'][property.name='CODEBUFF_API_KEY']",
        message: 'process.env.CODEBUFF_API_KEY is not allowed in web package. Users must provide their own API key via Authorization header.',
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
