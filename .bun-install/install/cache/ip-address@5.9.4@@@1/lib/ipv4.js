'use strict';

var BigInteger = require('jsbn').BigInteger;
var common = require('./common.js');
var sprintf = require('sprintf-js').sprintf;
var _ = require('lodash');

var constants = require('./v4/constants.js');

/**
 * Represents an IPv4 address
 * @class Address4
 * @param {string} address - An IPv4 address string
 */
function Address4(address) {
  this.valid = false;
  this.address = address;
  this.groups = constants.GROUPS;

  this.v4 = true;

  this.subnet = '/32';
  this.subnetMask = 32;

  var subnet = constants.RE_SUBNET_STRING.exec(address);

  if (subnet) {
    this.parsedSubnet = subnet[0].replace('/', '');
    this.subnetMask = parseInt(this.parsedSubnet, 10);
    this.subnet = '/' + this.subnetMask;

    if (this.subnetMask < 0 || this.subnetMask > constants.BITS) {
      this.valid = false;
      this.error = 'Invalid subnet mask.';

      return;
    }

    address = address.replace(constants.RE_SUBNET_STRING, '');
  }

  this.addressMinusSuffix = address;

  this.parsedAddress = this.parse(address);
}

/*
 * Parses a v4 address
 */
Address4.prototype.parse = function (address) {
  var groups = address.split('.');

  if (address.match(constants.RE_ADDRESS)) {
    this.valid = true;
  } else {
    this.error = 'Invalid IPv4 address.';
  }

  return groups;
};

/**
 * Return true if the address is valid
 * @memberof Address4
 * @instance
 * @returns {Boolean}
 */
Address4.prototype.isValid = function () {
  return this.valid;
};

/**
 * Returns the correct form of an address
 * @memberof Address4
 * @instance
 * @returns {String}
 */
Address4.prototype.correctForm = function () {
  return this.parsedAddress.map(function (part) {
    return parseInt(part, 10);
  }).join('.');
};

/**
 * Returns true if the address is correct, false otherwise
 * @memberof Address4
 * @instance
 * @returns {Boolean}
 */
Address4.prototype.isCorrect = common.isCorrect(constants.BITS);

/**
 * Converts a hex string to an IPv4 address object
 * @memberof Address4
 * @static
 * @param {string} hex - a hex string to convert
 * @returns {Address4}
 */
Address4.fromHex = function (hex) {
  var padded = _.padStart(hex.replace(/:/g, ''), 8, '0');
  var groups = [];
  var i;

  for (i = 0; i < 8; i += 2) {
    var h = padded.slice(i, i + 2);

    groups.push(parseInt(h, 16));
  }

  return new Address4(groups.join('.'));
};

/**
 * Converts an integer into a IPv4 address object
 * @memberof Address4
 * @static
 * @param {integer} integer - a number to convert
 * @returns {Address4}
 */
Address4.fromInteger = function (integer) {
  return Address4.fromHex(integer.toString(16));
};

/**
 * Converts an IPv4 address object to a hex string
 * @memberof Address4
 * @instance
 * @returns {String}
 */
Address4.prototype.toHex = function () {
  return this.parsedAddress.map(function (part) {
    return sprintf('%02x', parseInt(part, 10));
  }).join(':');
};

/**
 * Converts an IPv4 address object to an array of bytes
 * @memberof Address4
 * @instance
 * @returns {Array}
 */
Address4.prototype.toArray = function () {
  return this.parsedAddress.map(function (part) {
    return parseInt(part, 10);
  });
};

/**
 * Converts an IPv4 address object to an IPv6 address group
 * @memberof Address4
 * @instance
 * @returns {String}
 */
Address4.prototype.toGroup6 = function () {
  var output = [];
  var i;

  for (i = 0; i < constants.GROUPS; i += 2) {
    var hex = sprintf('%02x%02x',
      parseInt(this.parsedAddress[i], 10),
      parseInt(this.parsedAddress[i + 1], 10));

    output.push(sprintf('%x', parseInt(hex, 16)));
  }

  return output.join(':');
};

/**
 * Returns the address as a BigInteger
 * @memberof Address4
 * @instance
 * @returns {BigInteger}
 */
Address4.prototype.bigInteger = function () {
  if (!this.valid) {
    return null;
  }

  return new BigInteger(this.parsedAddress.map(function (n) {
    return sprintf('%02x', parseInt(n, 10));
  }).join(''), 16);
};

/**
 * Helper function getting start address.
 * @memberof Address4
 * @instance
 * @returns {BigInteger}
 */
Address4.prototype._startAddress = function () {
  return new BigInteger(
    this.mask() + _.repeat('0', constants.BITS - this.subnetMask), 2
  );
};

/**
 * The first address in the range given by this address' subnet.
 * Often referred to as the Network Address.
 * @memberof Address4
 * @instance
 * @returns {Address4}
 */
Address4.prototype.startAddress = function () {
  return Address4.fromBigInteger(this._startAddress());
};

/**
 * The first host address in the range given by this address's subnet ie
 * the first address after the Network Address
 * @memberof Address4
 * @instance
 * @returns {Address4}
 */
Address4.prototype.startAddressExclusive = function () {
  var adjust = new BigInteger('1');
  return Address4.fromBigInteger(this._startAddress().add(adjust));
};

/**
 * Helper function getting end address.
 * @memberof Address4
 * @instance
 * @returns {BigInteger}
 */
Address4.prototype._endAddress = function () {
  return new BigInteger(
    this.mask() + _.repeat('1', constants.BITS - this.subnetMask), 2
  );
};

/**
 * The last address in the range given by this address' subnet
 * Often referred to as the Broadcast
 * @memberof Address4
 * @instance
 * @returns {Address4}
 */
Address4.prototype.endAddress = function () {
  return Address4.fromBigInteger(this._endAddress());
};

/**
 * The last host address in the range given by this address's subnet ie
 * the last address prior to the Broadcast Address
 * @memberof Address4
 * @instance
 * @returns {Address4}
 */
Address4.prototype.endAddressExclusive = function () {
  var adjust = new BigInteger('1');
  return Address4.fromBigInteger(this._endAddress().subtract(adjust));
};

/**
 * Converts a BigInteger to a v4 address object
 * @memberof Address4
 * @static
 * @param {BigInteger} bigInteger - a BigInteger to convert
 * @returns {Address4}
 */
Address4.fromBigInteger = function (bigInteger) {
  return Address4.fromInteger(parseInt(bigInteger.toString(), 10));
};

/**
 * Returns the first n bits of the address, defaulting to the
 * subnet mask
 * @memberof Address4
 * @instance
 * @returns {String}
 */
Address4.prototype.mask = function (optionalMask) {
  if (optionalMask === undefined) {
    optionalMask = this.subnetMask;
  }

  return this.getBitsBase2(0, optionalMask);
};

/**
 * Returns the bits in the given range as a base-2 string
 * @memberof Address4
 * @instance
 * @returns {string}
 */
Address4.prototype.getBitsBase2 = function (start, end) {
  return this.binaryZeroPad().slice(start, end);
};

/**
 * Returns true if the given address is in the subnet of the current address
 * @memberof Address4
 * @instance
 * @returns {boolean}
 */
Address4.prototype.isInSubnet = common.isInSubnet;

/**
 * Returns a zero-padded base-2 string representation of the address
 * @memberof Address4
 * @instance
 * @returns {string}
 */
Address4.prototype.binaryZeroPad = function () {
  return _.padStart(this.bigInteger().toString(2), constants.BITS, '0');
};

module.exports = Address4;
