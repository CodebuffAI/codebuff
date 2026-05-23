/**
 * @fileoverview Rules enforcing best practices while using Tailwind CSS
 * @author François Massart
 */
'use strict';

//------------------------------------------------------------------------------
// Plugin Definition
//------------------------------------------------------------------------------

// import all rules in lib/rules
var base = __dirname + '/rules/';
module.exports = {
  rules: {
    'classnames-order': require(base + 'classnames-order'),
    'enforces-negative-arbitrary-values': require(base + 'enforces-negative-arbitrary-values'),
    'enforces-shorthand': require(base + 'enforces-shorthand'),
    'migration-from-tailwind-2': require(base + 'migration-from-tailwind-2'),
    'no-arbitrary-value': require(base + 'no-arbitrary-value'),
    'no-contradicting-classname': require(base + 'no-contradicting-classname'),
    'no-custom-classname': require(base + 'no-custom-classname'),
    'no-unnecessary-arbitrary-value': require(base + 'no-unnecessary-arbitrary-value'),
  },
  configs: {
    recommended: require('./config/recommended'),
    'flat/recommended': require('./config/flat-recommended'),
  },
};
