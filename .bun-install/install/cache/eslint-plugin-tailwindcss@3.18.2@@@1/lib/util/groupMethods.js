/**
 * @fileoverview Utilities used for grouping classnames
 */

'use strict';

// Ambiguous values
// ================
// Supported hints: length, color, angle, list
// -------------------------------------------
//
// border-[color/width]
// text-[color/size]
// ring-[color/width]
// ring-offset-[color/width]
// stroke-[current/width]
// bg-[color/(position/size)]
//
// font-[family/weight]

const angle = require('./types/angle');
const color = require('./types/color');
const length = require('./types/length');

/**
 * Escape special chars for regular expressions
 *
 * @param {String} str Regular expression to be escaped
 * @returns {String} Escaped version
 */
function escapeSpecialChars(str) {
  return str.replace(/\W/g, '\\$&');
}

/**
 * Generates the opacity suffix based on config
 *
 * @param {Object} config Tailwind CSS Config
 * @returns {String} The suffix or an empty string
 */
function generateOptionalOpacitySuffix(config) {
  const opacityKeys = !config.theme['opacity'] ? [] : Object.keys(config.theme['opacity']);
  opacityKeys.push('\\[(\\d*\\.?\\d*)%?\\]');
  return `(\\/(${opacityKeys.join('|')}))?`;
}

/**
 * Generate the possible options for the RegEx
 *
 * @param {String} propName The name of the prop e.g. textColor
 * @param {Array} keys Keys to be injected in the options
 * @param {Object} config Tailwind CSS Config
 * @param {Boolean} isNegative If the value is negative
 * @returns {String} Generated part of regex exposing the possible values
 */
function generateOptions(propName, keys, config, isNegative = false) {
  const opacitySuffixes = generateOptionalOpacitySuffix(config);
  const genericArbitraryOption = '\\[(.*)\\]';
  const defaultKeyIndex = keys.findIndex((v) => v === 'DEFAULT');
  if (defaultKeyIndex > -1) {
    keys.splice(defaultKeyIndex, 1);
  }
  const escapedKeys = keys.map((k) => escapeSpecialChars(k));
  switch (propName) {
    case 'dark':
      // Optional `dark` class
      if (config.darkMode === 'class') {
        return 'dark';
      } else if (Array.isArray(config.darkMode) && config.darkMode.length === 2 && config.darkMode[0] === 'class') {
        // https://tailwindcss.com/docs/dark-mode#customizing-the-class-name
        // For the sake of simplicity we only support a single class name
        let value = '';
        const res = /^\.(?<classnameValue>[A-Z0-9\:\-\_\[\d\]]*)$/gi.exec(config.darkMode[1]);
        if (res && res.groups) {
          if (res.groups.classnameValue) {
            value = res.groups.classnameValue;
          }
        }
        return value;
      } else {
        return '';
      }
    case 'arbitraryProperties':
      escapedKeys.push(genericArbitraryOption);
      return '(' + escapedKeys.join('|') + ')';
    case 'colors':
    case 'accentColor':
    case 'borderColor':
    case 'boxShadowColor':
    case 'divideColor':
    case 'fill':
    case 'outlineColor':
    case 'textColor':
    case 'stroke':
    case 'gradientColorStopPositions':
      // Colors can use segments like 'indigo' and 'indigo-light'
      // https://tailwindcss.com/docs/customizing-colors#color-object-syntax
      const options = [];
      keys.forEach((k) => {
        const color = config.theme[propName][k] || config.theme.colors[k];
        if (typeof color === 'string') {
          options.push(escapeSpecialChars(k) + opacitySuffixes);
        } else {
          const variants = Object.keys(color).map((colorKey) => escapeSpecialChars(colorKey));
          const defaultIndex = variants.findIndex((v) => v === 'DEFAULT');
          const hasDefault = defaultIndex > -1;
          if (hasDefault) {
            variants.splice(defaultIndex, 1);
          }
          options.push(k + '(\\-(' + variants.join('|') + '))' + (hasDefault ? '?' : '') + opacitySuffixes);
        }
      });
      const arbitraryColors = [...color.mergedColorValues];
      switch (propName) {
        case 'fill':
          // Forbidden prefixes
          arbitraryColors.push(`(?!(angle|length|list)\:).{1,}`);
          break;
        case 'gradientColorStopPositions':
          arbitraryColors.push(color.RGBAPercentages); // RGBA % 0.5[%]
          arbitraryColors.push(color.optionalColorPrefixedVar);
          arbitraryColors.push(color.notHSLAPlusWildcard);
          break;
        case 'textColor':
          arbitraryColors.push(color.RGBAPercentages); // RGBA % 0.5[%]
          arbitraryColors.push(color.mandatoryColorPrefixed);
          break;
        default:
          arbitraryColors.push(color.mandatoryColorPrefixed);
      }
      options.push(`\\[(${arbitraryColors.join('|')})\\]`);
      return '(' + options.join('|') + ')';
    case 'borderSpacing':
    case 'borderWidth':
    case 'divideWidth':
    case 'fontSize':
    case 'outlineWidth':
    case 'outlineOffset':
    case 'ringWidth':
    case 'ringOffsetWidth':
    case 'textUnderlineOffset':
      escapedKeys.push(length.selectedUnitsRegEx);
      escapedKeys.push(length.anyCalcRegEx);
      // Mandatory `length:` prefix + wildcard
      escapedKeys.push(`\\[length\\:.{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'strokeWidth':
      escapedKeys.push(length.selectedUnitsRegEx);
      escapedKeys.push(length.anyCalcRegEx);
      // Mandatory `length:` prefix + calc + wildcard
      escapedKeys.push(`\\[length\\:calc\\(.{1,}\\)\\]`);
      // Mandatory `length:` prefix + wildcard + optional units
      escapedKeys.push(`\\[length\\:(.{1,})(${length.selectedUnits.join('|')})?\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'gap':
    case 'height':
    case 'lineHeight':
    case 'maxHeight':
    case 'size':
    case 'maxWidth':
    case 'minHeight':
    case 'minWidth':
    case 'padding':
    case 'width':
    case 'blur':
    case 'brightness':
    case 'contrast':
    case 'grayscale':
    case 'invert':
    case 'saturate':
    case 'sepia':
    case 'backdropBlur':
    case 'backdropBrightness':
    case 'backdropContrast':
    case 'backdropGrayscale':
    case 'backdropInvert':
    case 'backdropOpacity':
    case 'backdropSaturate':
    case 'backdropSepia':
    case 'transitionDuration':
    case 'transitionTimingFunction':
    case 'transitionDelay':
    case 'animation':
    case 'transformOrigin':
    case 'scale':
    case 'cursor':
      // All units
      escapedKeys.push(length.mergedUnitsRegEx);
      // Forbidden prefixes
      escapedKeys.push(`\\[(?!(angle|color|length|list)\:).{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'backdropHueRotate':
    case 'hueRotate':
    case 'inset':
    case 'letterSpacing':
    case 'margin':
    case 'scrollMargin':
    case 'skew':
    case 'space':
    case 'textIndent':
    case 'translate':
      // All units
      escapedKeys.push(length.mergedUnitsRegEx);
      // Forbidden prefixes
      escapedKeys.push(`\\[(?!(angle|color|length|list)\:).{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'backgroundOpacity':
    case 'borderOpacity':
    case 'opacity':
    case 'ringOpacity':
      // 0 ... .5 ... 1
      escapedKeys.push(`\\[(0(\\.\\d{1,})?|\\.\\d{1,}|1)\\]`);
      escapedKeys.push(length.anyCalcRegEx);
      // Unprefixed var()
      escapedKeys.push(`\\[var\\(\\-\\-[A-Za-z\\-]{1,}\\)\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'rotate':
      escapedKeys.push(`\\[(${angle.mergedAngleValues.join('|')})\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'gridTemplateColumns':
    case 'gridColumn':
    case 'gridColumnStart':
    case 'gridColumnEnd':
    case 'gridTemplateRows':
    case 'gridRow':
    case 'gridRowStart':
    case 'gridRowEnd':
    case 'gridAutoColumns':
    case 'gridAutoRows':
      // Forbidden prefixes
      escapedKeys.push(`\\[(?!(angle|color|length)\:).{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'listStyleType':
      // Forbidden prefixes
      escapedKeys.push(`\\[(?!(angle|color|length|list)\:).{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'objectPosition':
      // Forbidden prefixes
      escapedKeys.push(`\\[(?!(angle|color|length)\:).{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'backgroundPosition':
    case 'boxShadow':
    case 'dropShadow':
    case 'transitionProperty':
      // Forbidden prefixes
      escapedKeys.push(`\\[(?!((angle|color|length|list)\:)|#|var\\().{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'backgroundSize':
      // Forbidden prefixes
      escapedKeys.push(`\\[length\:.{1,}\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'backgroundImageUrl':
      // Forbidden prefixes
      escapedKeys.push(`.{1,}`);
      return '(' + escapedKeys.join('|') + ')';
    case 'backgroundImage':
      // Forbidden prefixes
      escapedKeys.push(`\\[url\\(.{1,}\\)\\]`);
      return '(' + escapedKeys.join('|') + ')';
    case 'order':
    case 'zIndex':
      escapedKeys.push(genericArbitraryOption);
      return '(' + escapedKeys.join('|') + ')';
    case 'fontWeight':
    case 'typography':
    case 'lineClamp':
      // Cannot be arbitrary?
      return '(' + escapedKeys.join('|') + ')';
    case 'aspectRatio':
    case 'flexGrow':
    case 'flexShrink':
    case 'fontFamily':
    case 'flex':
    case 'borderRadius':
    default:
      escapedKeys.push(genericArbitraryOption);
      return '(' + escapedKeys.join('|') + ')';
  }
}

const cachedRegexes = new WeakMap();

/**
 * Customize the regex based on config
 *
 * @param {String} re Regular expression
 * @param {Object} config The merged Tailwind CSS config
 * @returns {String} Patched version with config values and additional parameters
 */
function patchRegex(re, config) {
  if (!cachedRegexes.has(config)) {
    cachedRegexes.set(config, {});
  }
  const cache = cachedRegexes.get(config);
  if (re in cache) {
    return cache[re];
  }
  let patched = '\\!?';
  // Prefix
  if (config.prefix.length) {
    patched += escapeSpecialChars(config.prefix);
  }
  // Props
  let replaced = re;
  const propsRe = /\$\{(\-?[a-z]*)\}/gi;
  const res = replaced.matchAll(propsRe);
  const resArray = [...res];
  const props = resArray.map((arr) => arr[1]);
  if (props.length === 0) {
    return (cache[re] = `${patched}(${replaced})`);
  }
  // e.g. backgroundColor, letterSpacing, -margin...
  props.forEach((prop) => {
    const token = new RegExp('\\$\\{' + prop + '\\}');
    const isNegative = prop.substr(0, 1) === '-';
    const absoluteProp = isNegative ? prop.substr(1) : prop;
    if (prop === 'dark') {
      // Special case, not a default property from the theme
      replaced = replaced.replace(token, generateOptions(absoluteProp, [], config, isNegative));
      return `${patched}(${replaced})`;
    } else if (prop === 'arbitraryProperties') {
      // Special case
      replaced = replaced.replace(
        new RegExp('\\$\\{' + absoluteProp + '\\}'),
        generateOptions(absoluteProp, [], config, isNegative)
      );
      return `${patched}(${replaced})`;
    } else if (prop === 'backgroundImageUrl') {
      // Special case
      replaced = replaced.replace(new RegExp('\\$\\{' + prop + '\\}'), generateOptions(prop, [], config, false));
      return `${patched}(${replaced})`;
    } else if (!config.theme || !config.theme[absoluteProp]) {
      // prop not found in config
      return;
    }
    // Normal scenario
    const keys = Object.keys(config.theme[absoluteProp])
      .filter((key) => {
        if (isNegative) {
          // Negative prop cannot support NaN values and inherits positive values
          const val = config.theme[absoluteProp][key];
          const isCalc = typeof val === 'string' && val.indexOf('calc') === 0;
          const num = parseFloat(val);
          if (isCalc) {
            return true;
          }
          if (isNaN(num)) {
            return false;
          }
        } else if (key[0] === '-') {
          // Positive prop cannot use key starting with '-'
          return false;
        }
        return true;
      })
      .map((key) => {
        if (isNegative && key[0] === '-') {
          return key.substring(1);
        }
        return key;
      });
    if (keys.length === 0 || replaced.match(token) === null) {
      // empty array
      return;
    }
    const opts = generateOptions(absoluteProp, keys, config, isNegative);
    replaced = replaced.replace(token, opts);
  });
  return (cache[re] = `${patched}(${replaced})`);
}

/**
 * Generates a flatten array from the groups config
 *
 * @param {Array} groupsConfig The array of objects containing the regex
 * @param {Object} twConfig The merged config of Tailwind CSS
 * @returns {Array} Flatten array
 */
function getGroups(groupsConfig, twConfig = null) {
  const groups = [];
  groupsConfig.forEach((group) => {
    // e.g. SIZING or SPACING
    group.members.forEach((prop) => {
      // e.g. Width or Padding
      if (typeof prop.members === 'string') {
        // Unique property, like `width` limited to one value
        groups.push(prop.members);
      } else {
        // Multiple properties, like `padding`, `padding-top`...
        prop.members.forEach((subprop) => {
          groups.push(subprop.members);
        });
      }
    });
  });
  if (twConfig === null) {
    return groups;
  }
  return groups.map((re) => patchRegex(re, twConfig));
}

/**
 * Generates an array of empty arrays prior to grouping
 *
 * @param {Array} groups The array of objects containing the regex
 * @returns {Array} Array of empty arrays
 */
function initGroupSlots(groups) {
  const slots = [];
  groups.forEach((g) => slots.push([]));
  return slots;
}

/**
 * Searches for a match between classname and Tailwind CSS group
 *
 * @param {Array} name The target classname
 * @param {Array} arr The flatten array containing the regex
 * @param {String} separator The delimiter to be used between variants
 * @returns {Array} Array of empty arrays
 */
function getGroupIndex(name, arr, separator = ':') {
  const classSuffix = getSuffix(name, separator);
  let idx = arr.findIndex((pattern) => {
    const classRe = new RegExp(`^(${pattern})$`);
    return classRe.test(classSuffix);
  }, classSuffix);
  return idx;
}

/**
 * Generates a flatten array from the groups configKeys
 *
 * @param {Array} groupsConfig The array of objects containing the regex
 * @param {Object} twConfig The merged config of Tailwind CSS
 * @returns {Array} Flatten array
 */
function getGroupConfigKeys(groupsConfig) {
  const groups = [];
  groupsConfig.forEach((group) => {
    // e.g. SIZING or SPACING
    group.members.forEach((prop) => {
      // e.g. Width or Padding
      if (typeof prop.members === 'string') {
        // Unique property, like `width` limited to one value
        groups.push(prop.configKey ? prop.configKey : null);
      } else {
        // Multiple properties, like `padding`, `padding-top`...
        prop.members.forEach((subprop) => {
          groups.push(subprop.configKey ? subprop.configKey : null);
        });
      }
    });
  });
  return groups;
}

/**
 * Returns the prefix (variants) of a className including the separator or an empty string if none
 *
 * @param {String} name Classname to be parsed
 * @param {String} separator The separator character as in config
 * @returns {String} The prefix
 */
function getPrefix(name, separator) {
  const rootSeparator = String.raw`(?<!\[[a-z0-9\-]*)(${separator})(?![a-z0-9\-]*\])`;
  const rootSeparatorRegex = new RegExp(rootSeparator);
  let classname = name;
  let index = 0;
  let results;
  while ((results = rootSeparatorRegex.exec(classname)) !== null) {
    const newIndex = results.index + separator.length;
    index += newIndex;
    classname = classname.substring(newIndex);
  }

  return index ? name.substring(0, index) : '';
}

/**
 * Returns the arbitrary property of className without the separator or an empty string if none
 * e.g. "[mask-type:luminance]" => "mask-type"
 *
 * @see https://tailwindcss.com/docs/adding-custom-styles#arbitrary-properties
 * @param {String} name Classname suffix (without it variants) to be parsed
 * @param {String} separator The separator character as in config
 * @returns {String} The arbitrary property
 */
function getArbitraryProperty(name, separator) {
  const arbitraryPropPattern = String.raw`^\[([a-z\-]*)${separator}\.*`;
  const arbitraryPropRegExp = new RegExp(arbitraryPropPattern);
  const results = arbitraryPropRegExp.exec(name);
  return results === null ? '' : results[1];
}

/**
 * Get the last part of the full classname
 * e.g. "lg:w-[100px]" => "w-[100px]"
 *
 * @param {String} className The target classname
 * @param {String} separator The delimiter to be used between variants
 * @returns {String} The classname without its variants
 */
function getSuffix(className, separator = ':') {
  const prefix = getPrefix(className, separator);
  return className.substring(prefix.length);
}

/**
 * Find the group of a classname
 *
 * @param {String} name Classname to be find using patterns (without modifiers)
 * @param {Array} group The group being tested
 * @param {Object} config Tailwind CSS config
 * @param {String} parentType The name of the parent group
 * @returns {Object} The infos
 */
function findInGroup(name, group, config, parentType = null) {
  if (typeof group.members === 'string') {
    const pattern = patchRegex(group.members, config);
    const classRe = new RegExp(`^(${pattern})$`);
    if (classRe.test(name)) {
      const res = classRe.exec(name);
      let value = '';
      if (res && res.groups) {
        if (res.groups.value) {
          value = res.groups.value;
        }
        if (res.groups.negativeValue) {
          value = '-' + res.groups.negativeValue;
        }
      }
      return {
        group: parentType,
        ...group,
        value: value,
      };
    } else {
      return null;
    }
  } else {
    const innerGroup = group.members.find((v) => findInGroup(name, v, config, group.type));
    if (!innerGroup) {
      return null;
    } else {
      return findInGroup(name, innerGroup, config, group.type);
    }
  }
}

/**
 * Returns an object with parsed properties
 *
 * @param {String} name Classname to be parsed
 * @param {Array} arr The flatten array containing the regex
 * @param {Object} config The Tailwind CSS config
 * @param {Number} index The index
 * @returns {Object} Parsed infos
 */
function parseClassname(name, arr, config, index = null) {
  const leadingRe = new RegExp('^(?<leading>\\s*)');
  const trailingRe = new RegExp('(?<trailing>\\s*)$');
  let leading = '';
  let core = '';
  let trailing = '';
  const leadingRes = leadingRe.exec(name);
  if (leadingRes && leadingRes.groups) {
    leading = leadingRes.groups.leading || '';
  }
  const trailingRes = trailingRe.exec(name);
  if (trailingRes && trailingRes.groups) {
    trailing = trailingRes.groups.trailing || '';
  }
  core = name.substring(leading.length, name.length - trailing.length);
  const variants = getPrefix(core, config.separator);
  const classSuffix = getSuffix(core, config.separator);
  let slot = null;
  arr.forEach((group) => {
    if (slot === null) {
      const found = findInGroup(classSuffix, group, config);
      if (found) {
        slot = found;
      }
    }
  });
  const value = slot ? slot.value : '';
  const isNegative = value[0] === '-';
  const off = isNegative ? 1 : 0;
  const body = core.substr(0, core.length - value.length + off).substr(variants.length + off);
  return {
    index: index,
    name: core,
    variants: variants,
    parentType: slot ? slot.group : '',
    body: body,
    value: value,
    shorthand: slot && slot.shorthand ? slot.shorthand : '',
    leading: leading,
    trailing: trailing,
    important: body.substr(0, 1) === '!',
  };
}

module.exports = {
  initGroupSlots,
  getArbitraryProperty,
  getGroups,
  getGroupIndex,
  getGroupConfigKeys,
  getPrefix,
  getSuffix,
  parseClassname,
};
