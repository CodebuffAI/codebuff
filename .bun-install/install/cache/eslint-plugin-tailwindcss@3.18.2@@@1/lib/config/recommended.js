/**
 * @fileoverview Recommended coniguration for legacy style
 * @see https://eslint.org/docs/latest/use/configure/configuration-files
 * @author François Massart
 */
'use strict';

const rules = require('./rules');

module.exports = {
  plugins: ['tailwindcss'],
  parserOptions: {
    ecmaFeatures: {
      jsx: true,
    },
  },
  rules,
};
