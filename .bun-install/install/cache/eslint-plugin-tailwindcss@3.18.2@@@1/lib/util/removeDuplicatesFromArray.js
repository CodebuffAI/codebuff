'use strict';

function removeDuplicatesFromArray(arr) {
  return [...new Set(arr)];
}

module.exports = removeDuplicatesFromArray;
