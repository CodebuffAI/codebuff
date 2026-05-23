'use strict';

// A wrapper function that returns false if the address is not valid; used to
// avoid boilerplate checks for `if (!this.valid) { return false; }`
var falseIfInvalid = exports.falseIfInvalid = function (fn) {
  return function () {
    if (!this.valid) {
      return false;
    }

    return fn.apply(this, arguments);
  };
};

exports.isInSubnet = falseIfInvalid(function (address) {
  if (this.subnetMask < address.subnetMask) {
    return false;
  }

  if (this.mask(address.subnetMask) === address.mask()) {
    return true;
  }

  return false;
});

exports.isCorrect = function (defaultBits) {
  return falseIfInvalid(function () {
    if (this.addressMinusSuffix !== this.correctForm()) {
      return false;
    }

    if (this.subnetMask === defaultBits && !this.parsedSubnet) {
      return true;
    }

    return this.parsedSubnet === String(this.subnetMask);
  });
};
