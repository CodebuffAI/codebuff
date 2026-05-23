/**
 * @fileoverview Recommended coniguration for flat style
 * @see https://eslint.org/docs/latest/use/configure/configuration-files-new
 * @author François Massart
 */
'use strict';

const rules = require('./rules');

module.exports = [
  {
    name: 'tailwindcss:base',
    plugins: {
      get tailwindcss() {
        return require('../index');
      },
    },
    languageOptions: {
      parserOptions: {
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
  },
  {
    name: 'tailwindcss:rules',
    rules,
  },
];
