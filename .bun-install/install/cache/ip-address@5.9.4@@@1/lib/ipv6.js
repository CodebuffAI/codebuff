'use strict';

var BigInteger = require('jsbn').BigInteger;
var sprintf = require('sprintf-js').sprintf;
var _ = require('lodash');

var constants4 = require('./v4/constants.js');
var constants6 = require('./v6/constants.js');

var Address4 = require('./ipv4.js');

function addCommas(number) {
  var r = /(\d+)(\d{3})/;

  while (r.test(number)) {
    number = number.replace(r, '$1,$2');
  }

  return number;
}

function spanLeadingZeroes4(n) {
  n = n.replace(/^(0{1,})([1-9]+)$/, '<span class="parse-error">$1</span>$2');
  n = n.replace(/^(0{1,})(0)$/, '<span class="parse-error">$1</span>$2');

  return n;
}

/**
 * Represents an IPv6 address
 * @class Address6
 * @param {string} address - An IPv6 address string
 * @param {number} [groups=8] - How many octets to parse
 * @example
 * var address = new Address6('2001::/32');
 */
function Address6(address, optionalGroups) {
  if (optionalGroups === undefined) {
    this.groups = constants6.GROUPS;
  } else {
    this.groups = optionalGroups;
  }

  this.v4 = false;

  this.subnet = '/128';
  this.subnetMask = 128;

  this.zone = '';

  this.address = address;

  var subnet = constants6.RE_SUBNET_STRING.exec(address);

  if (subnet) {
    this.parsedSubnet = subnet[0].replace('/', '');
    this.subnetMask = parseInt(this.parsedSubnet, 10);
    this.subnet = '/' + this.subnetMask;

    if (isNaN(this.subnetMask) ||
      this.subnetMask < 0 ||
      this.subnetMask > constants6.BITS) {
      this.valid = false;
      this.error = 'Invalid subnet mask.';

      return;
    }

    address = address.replace(constants6.RE_SUBNET_STRING, '');
  } else if (/\//.test(address)) {
    this.valid = false;
    this.error = 'Invalid subnet mask.';

    return;
  }

  var zone = constants6.RE_ZONE_STRING.exec(address);

  if (zone) {
    this.zone = zone[0];

    address = address.replace(constants6.RE_ZONE_STRING, '');
  }

  this.addressMinusSuffix = address;

  this.parsedAddress = this.parse(this.addressMinusSuffix);
}

_.merge(Address6.prototype, require('./v6/attributes.js'));
_.merge(Address6.prototype, require('./v6/html.js'));
_.merge(Address6.prototype, require('./v6/regular-expressions.js'));

/**
 * Convert a BigInteger to a v6 address object
 * @memberof Address6
 * @static
 * @param {BigInteger} bigInteger - a BigInteger to convert
 * @returns {Address6}
 * @example
 * var bigInteger = new BigInteger('1000000000000');
 * var address = Address6.fromBigInteger(bigInteger);
 * address.correctForm(); // '::e8:d4a5:1000'
 */
Address6.fromBigInteger = function (bigInteger) {
  var hex = _.padStart(bigInteger.toString(16), 32, '0');
  var groups = [];
  var i;

  for (i = 0; i < constants6.GROUPS; i++) {
    groups.push(hex.slice(i * 4, (i + 1) * 4));
  }

  return new Address6(groups.join(':'));
};

/**
 * Convert a URL (with optional port number) to an address object
 * @memberof Address6
 * @static
 * @param {string} url - a URL with optional port number
 * @returns {Address6}
 * @example
 * var addressAndPort = Address6.fromURL('http://[ffff::]:8080/foo/');
 * addressAndPort.address.correctForm(); // 'ffff::'
 * addressAndPort.port; // 8080
 */
Address6.fromURL = function (url) {
  var host;
  var port;
  var result;

  // If we have brackets parse them and find a port
  if (url.indexOf('[') !== -1 && url.indexOf(']:') !== -1) {
    result = constants6.RE_URL_WITH_PORT.exec(url);

    if (result === null) {
      return {
        error: 'failed to parse address with port',
        address: null,
        port: null
      };
    }

    host = result[1];
    port = result[2];
  // If there's a URL extract the address
  } else if (url.indexOf('/') !== -1) {
    // Remove the protocol prefix
    url = url.replace(/^[a-z0-9]+:\/\//, '');

    // Parse the address
    result = constants6.RE_URL.exec(url);

    if (result === null) {
      return {
        error: 'failed to parse address from URL',
        address: null,
        port: null
      };
    }

    host = result[1];
  // Otherwise just assign the URL to the host and let the library parse it
  } else {
    host = url;
  }

  // If there's a port convert it to an integer
  if (port) {
    port = parseInt(port, 10);

    //squelch out of range ports
    if (port < 0 || port > 65536) {
      port = null;
    }
  } else {
    // Standardize `undefined` to `null`
    port = null;
  }

  return {
    address: new Address6(host),
    port: port
  };
};

/**
 * Create an IPv6-mapped address given an IPv4 address
 * @memberof Address6
 * @static
 * @param {string} address - An IPv4 address string
 * @returns {Address6}
 * @example
 * var address = Address6.fromAddress4('192.168.0.1');
 * address.correctForm(); // '::ffff:c0a8:1'
 * address.to4in6(); // '::ffff:192.168.0.1'
 */
Address6.fromAddress4 = function (address4) {
  var address4 = new Address4(address4);

  var mask6 = constants6.BITS - (constants4.BITS - address4.subnetMask);

  return new Address6('::ffff:' + address4.correctForm() + '/' + mask6);
};

/**
 * Return an address from ip6.arpa form
 * @memberof Address6
 * @static
 * @param {string} arpaFormAddress - an 'ip6.arpa' form address 
 * @returns {Adress6}
 * @example
 * var address = Address6.fromArpa(e.f.f.f.3.c.2.6.f.f.f.e.6.6.8.e.1.0.6.7.9.4.e.c.0.0.0.0.1.0.0.2.ip6.arpa.)
 * address.correctForm(); // '2001:0:ce49:7601:e866:efff:62c3:fffe'
 */
Address6.fromArpa = function (arpaFormAddress) {
  //remove ending ".ip6.arpa." or just "."
  var address = arpaFormAddress.replace(/(\.ip6\.arpa)?\.$/, '');
  var semicolonAmount = 7;

  //correct ip6.arpa form with ending removed will be 63 characters
  if (address.length !== 63) {
    address = {
      error: "Not Valid 'ip6.arpa' form",
      address: null
    };
    return address;
  }

  address = address.split('.').reverse();

  for (var i = semicolonAmount; i > 0; i--) {
    var insertIndex = i * 4;
    address.splice(insertIndex, 0, ':');
  }

  address = address.join('');
  return new Address6(address);
};

/*
 * A helper function to compact an array
 */
function compact (address, slice) {
  var s1 = [];
  var s2 = [];
  var i;

  for (i = 0; i < address.length; i++) {
    if (i < slice[0]) {
      s1.push(address[i]);
    } else if (i > slice[1]) {
      s2.push(address[i]);
    }
  }

  return s1.concat(['compact']).concat(s2);
}

/**
 * Return the Microsoft UNC transcription of the address
 * @memberof Address6
 * @instance
 * @returns {String} the Microsoft UNC transcription of the address
 */
Address6.prototype.microsoftTranscription = function () {
  return sprintf('%s.ipv6-literal.net',
    this.correctForm().replace(/:/g, '-'));
};

/**
 * Return the first n bits of the address, defaulting to the subnet mask
 * @memberof Address6
 * @instance
 * @param {number} [mask=subnet] - the number of bits to mask
 * @returns {String} the first n bits of the address as a string
 */
Address6.prototype.mask = function (optionalMask) {
  if (optionalMask === undefined) {
    optionalMask = this.subnetMask;
  }

  return this.getBitsBase2(0, optionalMask);
};

/**
 * Return the number of possible subnets of a given size in the address
 * @memberof Address6
 * @instance
 * @param {number} [size=128] - the subnet size
 * @returns {String}
 */
// TODO: probably useful to have a numeric version of this too
Address6.prototype.possibleSubnets = function (optionalSubnetSize) {
  if (optionalSubnetSize === undefined) {
    optionalSubnetSize = 128;
  }

  var availableBits = constants6.BITS - this.subnetMask;
  var subnetBits = Math.abs(optionalSubnetSize - constants6.BITS);
  var subnetPowers = availableBits - subnetBits;

  if (subnetPowers < 0) {
    return '0';
  }

  return addCommas(new BigInteger('2', 10).pow(subnetPowers).toString(10));
};

/**
 * Helper function getting start address.
 * @memberof Address6
 * @instance
 * @returns {BigInteger}
 */
Address6.prototype._startAddress = function () {
  return new BigInteger(
    this.mask() + _.repeat('0', constants6.BITS - this.subnetMask), 2
  );
};

/**
 * The first address in the range given by this address' subnet
 * Often referred to as the Network Address.
 * @memberof Address6
 * @instance
 * @returns {Address6}
 */
Address6.prototype.startAddress = function () {
  return Address6.fromBigInteger(this._startAddress());
};

/**
 * The first host address in the range given by this address's subnet ie
 * the first address after the Network Address
 * @memberof Address6
 * @instance
 * @returns {Address6}
 */
Address6.prototype.startAddressExclusive = function () {
  var adjust = new BigInteger('1');
  return Address6.fromBigInteger(this._startAddress().add(adjust));
};

/**
 * Helper function getting end address.
 * @memberof Address6
 * @instance
 * @returns {BigInteger}
 */
Address6.prototype._endAddress = function () {
  return new BigInteger(
    this.mask() + _.repeat('1', constants6.BITS - this.subnetMask), 2
  );
};

/**
 * The last address in the range given by this address' subnet
 * Often referred to as the Broadcast
 * @memberof Address6
 * @instance
 * @returns {Address6}
 */
Address6.prototype.endAddress = function () {
  return Address6.fromBigInteger(this._endAddress());
};

/**
 * The last host address in the range given by this address's subnet ie
 * the last address prior to the Broadcast Address
 * @memberof Address6
 * @instance
 * @returns {Address6}
 */
Address6.prototype.endAddressExclusive = function () {
  var adjust = new BigInteger('1');
  return Address6.fromBigInteger(this._endAddress().subtract(adjust));
};

/**
 * Return the scope of the address
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.getScope = function () {
  var scope = constants6.SCOPES[this.getBits(12, 16)];

  if (this.getType() === 'Global unicast' &&
      scope !== 'Link local') {
    scope = 'Global';
  }

  return scope;
};

/**
 * Return the type of the address
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.getType = function () {
  var self = this;

  function isType(name, type) {
    return self.isInSubnet(new Address6(type));
  }

  return _.find(constants6.TYPES, isType) || 'Global unicast';
};

/**
 * Return the bits in the given range as a BigInteger
 * @memberof Address6
 * @instance
 * @returns {BigInteger}
 */
Address6.prototype.getBits = function (start, end) {
  return new BigInteger(this.getBitsBase2(start, end), 2);
};

/**
 * Return the bits in the given range as a base-2 string
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.getBitsBase2 = function (start, end) {
  return this.binaryZeroPad().slice(start, end);
};

/**
 * Return the bits in the given range as a base-16 string
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.getBitsBase16 = function (start, end) {
  var length = end - start;

  if (length % 4 !== 0) {
    return null;
  }

  return _.padStart(this.getBits(start, end).toString(16), length / 4, '0');
};

/**
 * Return the bits that are set past the subnet mask length
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.getBitsPastSubnet = function () {
  return this.getBitsBase2(this.subnetMask, constants6.BITS);
};

/**
 * Return the reversed ip6.arpa form of the address
 * @memberof Address6
 * @param {Object} options
 * @param {boolean} options.omitSuffix - omit the "ip6.arpa" suffix
 * @instance
 * @returns {String}
 */
Address6.prototype.reverseForm = function (options) {
  if (!options) {
    options = {};
  }

  var characters = Math.floor(this.subnetMask / 4);

  var reversed = this.canonicalForm()
    .replace(/:/g, '')
    .split('')
    .slice(0, characters)
    .reverse()
    .join('.');

  if (characters > 0) {
    if (options.omitSuffix) {
      return reversed;
    }

    return sprintf('%s.ip6.arpa.', reversed);
  }

  if (options.omitSuffix) {
    return '';
  }

  return 'ip6.arpa.';
};

/**
 * Return the correct form of the address
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.correctForm = function () {
  if (!this.parsedAddress) {
    return null;
  }

  var i;
  var groups = [];

  var zeroCounter = 0;
  var zeroes = [];

  for (i = 0; i < this.parsedAddress.length; i++) {
    var value = parseInt(this.parsedAddress[i], 16);

    if (value === 0) {
      zeroCounter++;
    }

    if (value !== 0 && zeroCounter > 0) {
      if (zeroCounter > 1) {
        zeroes.push([i - zeroCounter, i - 1]);
      }

      zeroCounter = 0;
    }
  }

  // Do we end with a string of zeroes?
  if (zeroCounter > 1) {
    zeroes.push([this.parsedAddress.length - zeroCounter,
      this.parsedAddress.length - 1]);
  }

  var zeroLengths = zeroes.map(function (n) {
    return (n[1] - n[0]) + 1;
  });

  if (zeroes.length > 0) {
    var index = zeroLengths.indexOf(_.max(zeroLengths));

    groups = compact(this.parsedAddress, zeroes[index]);
  } else {
    groups = this.parsedAddress;
  }

  for (i = 0; i < groups.length; i++) {
    if (groups[i] !== 'compact') {
      groups[i] = parseInt(groups[i], 16).toString(16);
    }
  }

  var correct = groups.join(':');

  correct = correct.replace(/^compact$/, '::');
  correct = correct.replace(/^compact|compact$/, ':');
  correct = correct.replace(/compact/, '');

  return correct;
};

/**
 * Return a zero-padded base-2 string representation of the address
 * @memberof Address6
 * @instance
 * @returns {String}
 * @example
 * var address = new Address6('2001:4860:4001:803::1011');
 * address.binaryZeroPad();
 * // '0010000000000001010010000110000001000000000000010000100000000011
 * //  0000000000000000000000000000000000000000000000000001000000010001'
 */
Address6.prototype.binaryZeroPad = function () {
  return _.padStart(this.bigInteger().toString(2), constants6.BITS, '0');
};

// TODO: Improve the semantics of this helper function
Address6.prototype.parse4in6 = function (address) {
  var groups = address.split(':');
  var lastGroup = groups.slice(-1)[0];

  var address4 = lastGroup.match(constants4.RE_ADDRESS);

  if (address4) {
    var temp4 = new Address4(address4[0]);

    for (var i = 0; i < temp4.groups; i++) {
      if (/^0[0-9]+/.test(temp4.parsedAddress[i])) {
        this.valid = false;
        this.error = 'IPv4 addresses can not have leading zeroes.';

        this.parseError = address.replace(constants4.RE_ADDRESS,
          temp4.parsedAddress.map(spanLeadingZeroes4).join('.'));

        return null;
      }
    }

    this.v4 = true;

    groups[groups.length - 1] = temp4.toGroup6();

    address = groups.join(':');
  }

  return address;
};

// TODO: Make private?
Address6.prototype.parse = function (address) {
  address = this.parse4in6(address);

  if (this.error) {
    return null;
  }

  var badCharacters = address.match(constants6.RE_BAD_CHARACTERS);

  if (badCharacters) {
    this.valid = false;
    this.error = sprintf('Bad character%s detected in address: %s',
      badCharacters.length > 1 ? 's' : '', badCharacters.join(''));

    this.parseError = address.replace(constants6.RE_BAD_CHARACTERS,
      '<span class="parse-error">$1</span>');

    return null;
  }

  var badAddress = address.match(constants6.RE_BAD_ADDRESS);

  if (badAddress) {
    this.valid = false;
    this.error = sprintf('Address failed regex: %s', badAddress.join(''));

    this.parseError = address.replace(constants6.RE_BAD_ADDRESS,
      '<span class="parse-error">$1</span>');

    return null;
  }

  var groups = [];

  var halves = address.split('::');

  if (halves.length === 2) {
    var first = halves[0].split(':');
    var last = halves[1].split(':');

    if (first.length === 1 &&
      first[0] === '') {
      first = [];
    }

    if (last.length === 1 &&
      last[0] === '') {
      last = [];
    }

    var remaining = this.groups - (first.length + last.length);

    if (!remaining) {
      this.valid = false;
      this.error = 'Error parsing groups';

      return null;
    }

    this.elidedGroups = remaining;

    this.elisionBegin = first.length;
    this.elisionEnd = first.length + this.elidedGroups;

    first.forEach(function (group) {
      groups.push(group);
    });

    for (var i = 0; i < remaining; i++) {
      groups.push(0);
    }

    last.forEach(function (group) {
      groups.push(group);
    });
  } else if (halves.length === 1) {
    groups = address.split(':');

    this.elidedGroups = 0;
  } else {
    this.valid = false;
    this.error = 'Too many :: groups found';

    return null;
  }

  groups = groups.map(function (g) {
    return sprintf('%x', parseInt(g, 16));
  });

  if (groups.length !== this.groups) {
    this.valid = false;
    this.error = 'Incorrect number of groups found';

    return null;
  }

  this.valid = true;

  return groups;
};

function paddedHex(octet) {
  return sprintf('%04x', parseInt(octet, 16));
}

/**
 * Return the canonical form of the address
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.canonicalForm = function () {
  if (!this.valid) {
    return null;
  }

  return this.parsedAddress.map(paddedHex).join(':');
};

/**
 * Return the decimal form of the address
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.decimal = function () {
  if (!this.valid) {
    return null;
  }

  return this.parsedAddress.map(function (n) {
    return sprintf('%05d', parseInt(n, 16));
  }).join(':');
};

/**
 * Return the address as a BigInteger
 * @memberof Address6
 * @instance
 * @returns {BigInteger}
 */
Address6.prototype.bigInteger = function () {
  if (!this.valid) {
    return null;
  }

  return new BigInteger(this.parsedAddress.map(paddedHex).join(''), 16);
};

/**
 * Return the last two groups of this address as an IPv4 address string
 * @memberof Address6
 * @instance
 * @returns {String}
 * @example
 * var address = new Address6('2001:4860:4001::1825:bf11');
 * address.to4(); // '24.37.191.17'
 */
Address6.prototype.to4 = function () {
  var binary = this.binaryZeroPad().split('');

  return Address4.fromHex(new BigInteger(binary.slice(96, 128)
    .join(''), 2).toString(16));
};

/**
 * Return the v4-in-v6 form of the address
 * @memberof Address6
 * @instance
 * @returns {String}
 */
Address6.prototype.to4in6 = function () {
  var address4 = this.to4();
  var address6 = new Address6(this.parsedAddress.slice(0, 6).join(':'), 6);

  var correct = address6.correctForm();

  var infix = '';

  if (!/:$/.test(correct)) {
    infix = ':';
  }

  return address6.correctForm() + infix + address4.address;
};

/**
 * Return an object containing the Teredo properties of the address
 * @memberof Address6
 * @instance
 * @returns {Object}
 */
Address6.prototype.inspectTeredo = function () {
  /*
  - Bits 0 to 31 are set to the Teredo prefix (normally 2001:0000::/32).
  - Bits 32 to 63 embed the primary IPv4 address of the Teredo server that
    is used.
  - Bits 64 to 79 can be used to define some flags. Currently only the
    higher order bit is used; it is set to 1 if the Teredo client is
    located behind a cone NAT, 0 otherwise. For Microsoft's Windows Vista
    and Windows Server 2008 implementations, more bits are used. In those
    implementations, the format for these 16 bits is "CRAAAAUG AAAAAAAA",
    where "C" remains the "Cone" flag. The "R" bit is reserved for future
    use. The "U" bit is for the Universal/Local flag (set to 0). The "G" bit
    is Individual/Group flag (set to 0). The A bits are set to a 12-bit
    randomly generated number chosen by the Teredo client to introduce
    additional protection for the Teredo node against IPv6-based scanning
    attacks.
  - Bits 80 to 95 contains the obfuscated UDP port number. This is the
    port number that is mapped by the NAT to the Teredo client with all
    bits inverted.
  - Bits 96 to 127 contains the obfuscated IPv4 address. This is the
    public IPv4 address of the NAT with all bits inverted.
  */
  var prefix = this.getBitsBase16(0, 32);

  var udpPort = this.getBits(80, 96).xor(new BigInteger('ffff', 16)).toString();

  var server4 = Address4.fromHex(this.getBitsBase16(32, 64));
  var client4 = Address4.fromHex(this.getBits(96, 128)
    .xor(new BigInteger('ffffffff', 16)).toString(16));

  var flags = this.getBits(64, 80);
  var flagsBase2 = this.getBitsBase2(64, 80);

  var coneNat = flags.testBit(15);
  var reserved = flags.testBit(14);
  var groupIndividual = flags.testBit(8);
  var universalLocal = flags.testBit(9);
  var nonce = new BigInteger(flagsBase2.slice(2, 6) +
    flagsBase2.slice(8, 16), 2).toString(10);

  return {
    prefix: sprintf('%s:%s', prefix.slice(0, 4), prefix.slice(4, 8)),
    server4: server4.address,
    client4: client4.address,
    flags: flagsBase2,
    coneNat: coneNat,
    microsoft: {
      reserved: reserved,
      universalLocal: universalLocal,
      groupIndividual: groupIndividual,
      nonce: nonce
    },
    udpPort: udpPort
  };
};

/**
 * Return an object containing the 6to4 properties of the address
 * @memberof Address6
 * @instance
 * @returns {Object}
 */
Address6.prototype.inspect6to4 = function () {
  /*
  - Bits 0 to 15 are set to the 6to4 prefix (2002::/16).
  - Bits 16 to 48 embed the IPv4 address of the 6to4 gateway that is used.
  */

  var prefix = this.getBitsBase16(0, 16);

  var gateway = Address4.fromHex(this.getBitsBase16(16, 48));

  return {
    prefix: sprintf('%s', prefix.slice(0, 4)),
    gateway: gateway.address
  };
};

/**
 * Return a v6 6to4 address from a v6 v4inv6 address
 * @memberof Address6
 * @instance
 * @returns {Address6}
 */
Address6.prototype.to6to4 = function () {
  if (!this.is4()) {
    return null;
  }

  var addr6to4 = [
    '2002',
    this.getBitsBase16(96, 112),
    this.getBitsBase16(112, 128),
    '',
    '/16'
  ].join(':');

  return new Address6(addr6to4);
};

/**
 * Return a byte array
 * @memberof Address6
 * @instance
 * @returns {Array}
 */
Address6.prototype.toByteArray = function () {
  var byteArray = this.bigInteger().toByteArray();

  // work around issue where `toByteArray` returns a leading 0 element
  if (byteArray.length === 17 && byteArray[0] === 0) {
    return byteArray.slice(1);
  }

  return byteArray;
};

function unsignByte(b) {
  return b & 0xFF;
}

/**
 * Return an unsigned byte array
 * @memberof Address6
 * @instance
 * @returns {Array}
 */
Address6.prototype.toUnsignedByteArray = function () {
  return this.toByteArray().map(unsignByte);
};

/**
 * Convert a byte array to an Address6 object
 * @memberof Address6
 * @static
 * @returns {Address6}
 */
Address6.fromByteArray = function (bytes) {
  return this.fromUnsignedByteArray(bytes.map(unsignByte));
};

/**
 * Convert an unsigned byte array to an Address6 object
 * @memberof Address6
 * @static
 * @returns {Address6}
 */
Address6.fromUnsignedByteArray = function (bytes) {
  var BYTE_MAX = new BigInteger('256', 10);
  var result = new BigInteger('0', 10);
  var multiplier = new BigInteger('1', 10);

  for (var i = bytes.length - 1; i >= 0; i--) {
    result = result.add(
      multiplier.multiply(new BigInteger(bytes[i].toString(10), 10)));

    multiplier = multiplier.multiply(BYTE_MAX);
  }

  return Address6.fromBigInteger(result);
};

module.exports = Address6;
