'use strict';
let resolveDefaultConfigPathAlias;

try {
  const { resolveDefaultConfigPath } = require('tailwindcss/lib/util/resolveConfigPath');
  resolveDefaultConfigPathAlias = resolveDefaultConfigPath;
} catch (err) {
  resolveDefaultConfigPathAlias = null;
}

function getOption(context, name) {
  // Options (defined at rule level)
  const options = context.options[0] || {};
  if (options[name] != undefined) {
    return options[name];
  }
  // Settings (defined at plugin level, shared accross rules)
  if (context.settings && context.settings.tailwindcss && context.settings.tailwindcss[name] != undefined) {
    return context.settings.tailwindcss[name];
  }
  // Fallback to defaults
  switch (name) {
    case 'callees':
      return ['classnames', 'clsx', 'ctl', 'cva', 'tv'];
    case 'ignoredKeys':
      return ['compoundVariants', 'defaultVariants'];
    case 'classRegex':
      return '^class(Name)?$';
    case 'config':
      if (resolveDefaultConfigPathAlias === null) {
        return 'tailwind.config.js';
      } else {
        return resolveDefaultConfigPathAlias();
      }
    case 'cssFiles':
      return ['**/*.css', '!**/node_modules', '!**/.*', '!**/dist', '!**/build'];
    case 'cssFilesRefreshRate':
      return 5_000;
    case 'removeDuplicates':
      return true;
    case 'skipClassAttribute':
      return false;
    case 'tags':
      return [];
    case 'whitelist':
      return [];
  }
}

module.exports = getOption;
