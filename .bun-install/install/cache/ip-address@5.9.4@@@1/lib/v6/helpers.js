'use strict';

var sprintf = require('sprintf-js').sprintf;

/**
 * @returns {String} the string with all zeroes contained in a <span>
 */
var spanAllZeroes = exports.spanAllZeroes = function (s) {
  return s.replace(/(0+)/g, '<span class="zero">$1</span>');
};

/**
 * @returns {String} the string with each character contained in a <span>
 */
exports.spanAll = function (s, optionalOffset) {
  if (optionalOffset === undefined) {
    optionalOffset = 0;
  }

  var letters = s.split('');

  return letters.map(function (n, i) {
    return sprintf('<span class="digit value-%s position-%d">%s</span>', n,
      i + optionalOffset,
      spanAllZeroes(n)); // XXX Use #base-2 .value-0 instead?
  }).join('');
};

function spanLeadingZeroesSimple(group) {
  return group.replace(/^(0+)/, '<span class="zero">$1</span>');
}

/**
 * @returns {String} the string with leading zeroes contained in a <span>
 */
exports.spanLeadingZeroes = function (address) {
  var groups = address.split(':');

  return groups.map(function (g) {
    return spanLeadingZeroesSimple(g);
  }).join(':');
};

/**
 * Groups an address
 * @returns {String} a grouped address
 */
exports.simpleGroup = function (addressString, offset) {
  var groups = addressString.split(':');

  if (!offset) {
    offset = 0;
  }

  return groups.map(function (g, i) {
    if (/group-v4/.test(g)) {
      return g;
    }

    return sprintf('<span class="hover-group group-%d">%s</span>',
      i + offset,
      spanLeadingZeroesSimple(g));
  }).join(':');
};
