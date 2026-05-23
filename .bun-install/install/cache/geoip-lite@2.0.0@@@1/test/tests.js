var { describe, it } = require('node:test');
var assert = require('node:assert');
var geoip = require('../lib/geoip');

describe('geoip-lite', function () {

	it('should return data for IPv4 and IPv6', function () {
		var ip = '8.8.4.4';
		var ipv6 = '2001:4860:b002::68';

		var actual = geoip.lookup(ip);
		assert.ok(actual, 'should return data about IPv4.');

		actual = geoip.lookup(ipv6);
		assert.ok(actual, 'should return data about IPv6.');
	});

	it('should return correct data for IPv4', function () {
		var ip = '72.229.28.185';
		var actual = geoip.lookup(ip);

		assert.notStrictEqual(actual.range, undefined, 'should contain IPv4 range');
		assert.strictEqual(actual.country, 'US', 'should match country');
		assert.strictEqual(actual.region, 'NY', 'should match region');
		assert.strictEqual(actual.eu, '0', 'should match eu');
		assert.strictEqual(actual.timezone, 'America/New_York', 'should match timezone');
		assert.strictEqual(actual.city, 'New York', 'should match city');
		assert.ok(actual.ll, 'should contain coordinates');
		assert.strictEqual(actual.metro, 501, 'should match metro');
		assert.strictEqual(actual.area, 1, 'should match area');
	});

	it('should return correct data for IPv6', function () {
		var ipv6 = '2001:1c04:400::1';
		var actual = geoip.lookup(ipv6);

		assert.notStrictEqual(actual.range, undefined, 'should contain IPv6 range');
		assert.strictEqual(actual.country, 'NL', 'should match country');
		assert.strictEqual(actual.region, 'NH', 'should match region');
		assert.strictEqual(actual.eu, '1', 'should match eu');
		assert.strictEqual(actual.timezone, 'Europe/Amsterdam', 'should match timezone');
		assert.strictEqual(actual.city, 'Amsterdam', 'should match city');
		assert.ok(actual.ll, 'should contain coordinates');
		assert.strictEqual(actual.metro, 0, 'should match metro');
		assert.strictEqual(actual.area, 5, 'should match area');
	});

	it('should handle UTF8 city names', function () {
		var ip = '2.139.175.1';
		var actual = geoip.lookup(ip);

		assert.ok(actual, 'Should return a non-null value for ' + ip);
		assert.strictEqual(actual.city, 'Pamplona', 'UTF8 city name does not match');
	});

	it('should match metro data', function () {
		var actual = geoip.lookup('23.240.63.68');

		assert.strictEqual(actual.city, 'Riverside');
		assert.strictEqual(actual.metro, 803);
	});

	it('should handle IPv4-mapped IPv6 addresses', function () {
		var actual = geoip.lookup('195.16.170.74');

		assert.strictEqual(actual.city, '');
		assert.strictEqual(actual.metro, 0);
	});

	it('should reload data synchronously', function () {
		var before4 = geoip.lookup('75.82.117.180');
		assert.notStrictEqual(before4, null);

		var before6 = geoip.lookup('::ffff:173.185.182.82');
		assert.notStrictEqual(before6, null);

		geoip.clear();

		var none4 = geoip.lookup('75.82.117.180');
		assert.strictEqual(none4, null);
		var none6 = geoip.lookup('::ffff:173.185.182.82');
		assert.strictEqual(none6, null);

		geoip.reloadDataSync();

		var after4 = geoip.lookup('75.82.117.180');
		assert.deepStrictEqual(before4, after4);
		var after6 = geoip.lookup('::ffff:173.185.182.82');
		assert.deepStrictEqual(before6, after6);
	});

	it('should reload data asynchronously', function (t, done) {
		var before4 = geoip.lookup('75.82.117.180');
		assert.notStrictEqual(before4, null);
		var before6 = geoip.lookup('::ffff:173.185.182.82');
		assert.notStrictEqual(before6, null);

		geoip.clear();

		var none4 = geoip.lookup('75.82.117.180');
		assert.strictEqual(none4, null);
		var none6 = geoip.lookup('::ffff:173.185.182.82');
		assert.strictEqual(none6, null);

		geoip.reloadData(function () {
			var after4 = geoip.lookup('75.82.117.180');
			assert.deepStrictEqual(before4, after4);
			var after6 = geoip.lookup('::ffff:173.185.182.82');
			assert.deepStrictEqual(before6, after6);

			done();
		});
	});

	it('should return object with empty fields for assigned IPs without full location', function () {
		var actual = geoip.lookup('195.16.170.74');

		assert.notStrictEqual(actual, null, 'should return data for an assigned IP');
		assert.notStrictEqual(actual.range, undefined, 'should contain range');
		assert.strictEqual(actual.country, 'GB', 'should match country');
		assert.strictEqual(actual.region, '', 'region should be empty');
		assert.strictEqual(actual.city, '', 'city should be empty');
		assert.strictEqual(actual.metro, 0, 'metro should be 0');
		assert.ok(actual.ll, 'should contain coordinates');
		assert.strictEqual(actual.ll[0] !== null, true, 'latitude should not be null');
		assert.strictEqual(actual.ll[1] !== null, true, 'longitude should not be null');
	});

	it('should return null for unassigned/reserved IPs', function () {
		// RFC 5737 TEST-NET-1 block -- reserved and never routed
		var ip = '192.0.2.1';
		var actual = geoip.lookup(ip);

		assert.strictEqual(actual, null, 'should return null for reserved/unassigned IP');
	});
});
