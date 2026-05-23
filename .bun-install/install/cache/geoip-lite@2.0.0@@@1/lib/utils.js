var utils = module.exports = {};

utils.aton4 = function(a) {
	var n = 0;
	var octet = 0;
	for (var i = 0, len = a.length; i <= len; i++) {
		if (i === len || a.charCodeAt(i) === 46) {
			n = ((n << 8) | octet) >>> 0;
			octet = 0;
		} else {
			octet = octet * 10 + (a.charCodeAt(i) - 48);
		}
	}
	return n;
};

utils.aton6 = function(a) {
	a = a.replace(/"/g, '').split(/:/);

	var l = a.length - 1;
	var i;

	if (a[l] === '') {
		a[l] = 0;
	}

	if (l < 7) {
		const omitted = 8 - a.length;
		const omitStart = a.indexOf('');
		const omitEnd = omitStart + 8 - a.length;

		for (let i = 7; i >= omitStart; i--) {
			if (i > omitEnd)
				a[i] = a[i - omitted];
			else
				a[i] = 0;
		}
	}

	for (i = 0; i < 8; i++) {
		if (!a[i]) {
			a[i]=0;
		} else {
			a[i] = parseInt(a[i], 16);
		}
	}

	var r = [];
	for (i = 0; i<4; i++) {
		r.push(((a[2*i]<<16) + a[2*i+1])>>>0);
	}

	return r;
};


utils.cmp = function(a, b) {
	if (typeof a === 'number' && typeof b === 'number') {
		return (a < b ? -1 : (a > b ? 1 : 0));
	}

	if (a instanceof Array && b instanceof Array) {
		return this.cmp6(a, b);
	}

	return null;
};

utils.cmp6 = function(a, b) {
	if (a[0] < b[0]) return -1;
	if (a[0] > b[0]) return 1;
	if (a[1] < b[1]) return -1;
	if (a[1] > b[1]) return 1;
	return 0;
};

utils.isPrivateIP = function(addr) {
	addr = addr.toString();

	return addr.match(/^10\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})/) != null ||
    addr.match(/^192\.168\.([0-9]{1,3})\.([0-9]{1,3})/) != null ||
    addr.match(/^172\.16\.([0-9]{1,3})\.([0-9]{1,3})/) != null ||
    addr.match(/^127\.([0-9]{1,3})\.([0-9]{1,3})\.([0-9]{1,3})/) != null ||
    addr.match(/^169\.254\.([0-9]{1,3})\.([0-9]{1,3})/) != null ||
    addr.match(/^fc00:/) != null || addr.match(/^fe80:/) != null;
};

utils.ntoa4 = function(n) {
	n = n.toString();
	n = '' + (n>>>24&0xff) + '.' + (n>>>16&0xff) + '.' + (n>>>8&0xff) + '.' + (n&0xff);

	return n;
};

utils.ntoa6 = function(n) {
	var a = "[";

	for (var i = 0; i<n.length; i++) {
		a += (n[i]>>>16).toString(16) + ':';
		a += (n[i]&0xffff).toString(16) + ':';
	}

	a = a.replace(/:$/, ']').replace(/:0+/g, ':').replace(/::+/, '::');

	return a;
};
