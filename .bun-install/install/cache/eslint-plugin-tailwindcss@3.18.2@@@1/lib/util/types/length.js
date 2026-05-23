const removeDuplicatesFromArray = require('../removeDuplicatesFromArray');

// Units
const fontUnits = ['cap', 'ch', 'em', 'ex', 'ic', 'lh', 'rem', 'rlh'];
const viewportUnits = ['vb', 'vh', 'vi', 'vw', 'vmin', 'vmax'];
const absoluteUnits = ['px', 'mm', 'cm', 'in', 'pt', 'pc'];
const perInchUnits = ['lin', 'pt', 'mm'];
const otherUnits = ['%'];
const mergedUnits = removeDuplicatesFromArray([
  ...fontUnits,
  ...viewportUnits,
  ...absoluteUnits,
  ...perInchUnits,
  ...otherUnits,
]);
const selectedUnits = mergedUnits.filter((el) => {
  // All units minus this blacklist
  return !['cap', 'ic', 'vb', 'vi'].includes(el);
});

const absoluteValues = ['0', 'xx\\-small', 'x\\-small', 'small', 'medium', 'large', 'x\\-large', 'xx\\-large'];
const relativeValues = ['larger', 'smaller'];
const globalValues = ['inherit', 'initial', 'unset'];
const mergedValues = [...absoluteValues, ...relativeValues, ...globalValues];

const mergedLengthValues = [`\\-?\\d*\\.?\\d*(${mergedUnits.join('|')})`, ...mergedValues];
mergedLengthValues.push('length\\:var\\(\\-\\-[a-z\\-]{1,}\\)');

const mergedUnitsRegEx = `\\[(\\d{1,}(\\.\\d{1,})?|(\\.\\d{1,})?)(${mergedUnits.join('|')})\\]`;

const selectedUnitsRegEx = `\\[(\\d{1,}(\\.\\d{1,})?|(\\.\\d{1,})?)(${selectedUnits.join('|')})\\]`;

const anyCalcRegEx = `\\[calc\\(.{1,}\\)\\]`;

const validZeroRegEx = `^(0(\\.0{1,})?|\\.0{1,})(${mergedUnits.join('|')})?$`;

module.exports = {
  mergedUnits,
  selectedUnits,
  mergedUnitsRegEx,
  selectedUnitsRegEx,
  anyCalcRegEx,
  mergedValues,
  mergedLengthValues,
  validZeroRegEx,
};
