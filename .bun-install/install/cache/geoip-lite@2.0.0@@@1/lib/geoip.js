var fs = require('fs');
var net = require('net');
var path = require('path');

var utils = require('./utils');
var fsWatcher = require('./fsWatcher');

var watcherName = 'dataWatcher';

var geodatadir = path.resolve(
	__dirname,
	global.geodatadir || process.env.GEODATADIR || '../data/'
);

var dataFiles = {
	city: path.join(geodatadir, 'geoip-city.dat'),
	city6: path.join(geodatadir, 'geoip-city6.dat'),
	cityNames: path.join(geodatadir, 'geoip-city-names.dat'),
	country: path.join(geodatadir, 'geoip-country.dat'),
	country6: path.join(geodatadir, 'geoip-country6.dat')
};

var privateRange4 = [
	[utils.aton4('10.0.0.0'), utils.aton4('10.255.255.255')],
	[utils.aton4('172.16.0.0'), utils.aton4('172.31.255.255')],
	[utils.aton4('192.168.0.0'), utils.aton4('192.168.255.255')]
];

var conf4 = {
	firstIP: null,
	lastIP: null,
	lastLine: 0,
	locationBuffer: null,
	locationRecordSize: 88,
	mainBuffer: null,
	recordSize: 24
};

var conf6 = {
	firstIP: null,
	lastIP: null,
	lastLine: 0,
	mainBuffer: null,
	recordSize: 48
};

var cache4 = { ...conf4 };
var cache6 = { ...conf6 };

var RECORD_SIZE = 10;
var RECORD_SIZE6 = 34;
var NO_LOCATION = (-1 >>> 0);

function bufstr(buf, start, end) {
	var nullPos = buf.indexOf(0, start);
	if (nullPos >= start && nullPos < end) {
		end = nullPos;
	}
	return buf.toString('utf8', start, end);
}

function readip6(buffer, recordSize, line, offset) {
	var baseOffset = (line * recordSize) + (offset * 16);
	return [
		buffer.readUInt32BE(baseOffset),
		buffer.readUInt32BE(baseOffset + 4)
	];
}

function lookup4(ip) {
	var fline = 0;
	var floor;
	var cline = cache4.lastLine;
	var ceil;
	var line;

	var buffer = cache4.mainBuffer;
	var locBuffer = cache4.locationBuffer;
	var privateRange = privateRange4;
	var recordSize = cache4.recordSize;
	var locRecordSize = cache4.locationRecordSize;

	var i;

	// outside IPv4 range
	if (ip > cache4.lastIP || ip < cache4.firstIP) {
		return null;
	}

	// private IP
	for (i = 0; i < privateRange.length; i++) {
		if (ip >= privateRange[i][0] && ip <= privateRange[i][1]) {
			return null;
		}
	}

	do {
		line = (fline + cline) >>> 1;
		let offset = line * recordSize;
		floor = buffer.readUInt32BE(offset);
		ceil  = buffer.readUInt32BE(offset + 4);

		if (floor <= ip && ceil >= ip) {
			let geodata = {
				range: [floor, ceil],
				country: '',
				region: '',
				eu: '',
				timezone: '',
				city: '',
				ll: [null, null]
			};

			if (recordSize === RECORD_SIZE) {
				geodata.country = buffer.toString('utf8', offset + 8, offset + 10);
			} else {
				let locId = buffer.readUInt32BE(offset + 8);

				if (NO_LOCATION > locId) {
					let locOffset = locId * locRecordSize;
					geodata.country = bufstr(locBuffer, locOffset, locOffset + 2);
					geodata.region = bufstr(locBuffer, locOffset + 2, locOffset + 5);
					geodata.metro = locBuffer.readInt32BE(locOffset + 5);
					geodata.ll[0] = buffer.readInt32BE(offset + 12) / 10000;
					geodata.ll[1] = buffer.readInt32BE(offset + 16) / 10000;
					geodata.area = buffer.readUInt32BE(offset + 20);
					geodata.eu = bufstr(locBuffer, locOffset + 9, locOffset + 10);
					geodata.timezone = bufstr(locBuffer, locOffset + 10, locOffset + 42);
					geodata.city = bufstr(locBuffer, locOffset + 42, locOffset + locRecordSize);
				}
			}

			return geodata;
		} else if (fline === cline) {
			return null;
		} else if (fline === (cline - 1)) {
			if (line === fline) {
				fline = cline;
			} else {
				cline = fline;
			}
		} else if (floor > ip) {
			cline = line;
		} else if (ceil < ip) {
			fline = line;
		}
	} while(1);
}

function lookup6(ip) {
	var buffer = cache6.mainBuffer;
	var recordSize = cache6.recordSize;
	var locBuffer = cache4.locationBuffer;
	var locRecordSize = cache4.locationRecordSize;

	var fline = 0;
	var floor;
	var cline = cache6.lastLine;
	var ceil;
	var line;

	if (utils.cmp6(ip, cache6.lastIP) > 0 || utils.cmp6(ip, cache6.firstIP) < 0) {
		return null;
	}

	do {
		line = (fline + cline) >>> 1;
		floor = readip6(buffer, recordSize, line, 0);
		ceil  = readip6(buffer, recordSize, line, 1);

		if (utils.cmp6(floor, ip) <= 0 && utils.cmp6(ceil, ip) >= 0) {
			let offset = line * recordSize;
			let geodata = {
				range: '',
				country: '',
				region: '',
				city: '',
				ll: [0, 0]
			};

			if (recordSize === RECORD_SIZE6) {
				geodata.country = bufstr(buffer, offset + 32, offset + 34);
			} else {
				let locId = buffer.readUInt32BE(offset + 32);

				if (NO_LOCATION > locId) {
					let locOffset = locId * locRecordSize;
					geodata.country = bufstr(locBuffer, locOffset, locOffset + 2);
					geodata.region = bufstr(locBuffer, locOffset + 2, locOffset + 5);
					geodata.metro = locBuffer.readInt32BE(locOffset + 5);
					geodata.ll[0] = buffer.readInt32BE(offset + 36) / 10000;
					geodata.ll[1] = buffer.readInt32BE(offset + 40) / 10000;
					geodata.area = buffer.readUInt32BE(offset + 44);
					geodata.eu = bufstr(locBuffer, locOffset + 9, locOffset + 10);
					geodata.timezone = bufstr(locBuffer, locOffset + 10, locOffset + 42);
					geodata.city = bufstr(locBuffer, locOffset + 42, locOffset + locRecordSize);
				}
			}
			return geodata;
		} else if (fline === cline) {
			return null;
		} else if (fline === (cline - 1)) {
			if (line === fline) {
				fline = cline;
			} else {
				cline = fline;
			}
		} else if (utils.cmp6(floor, ip) > 0) {
			cline = line;
		} else if (utils.cmp6(ceil, ip) < 0) {
			fline = line;
		}
	} while(1);
}

function get4mapped(ip) {
	var ipv6 = ip.toUpperCase();
	var v6prefixes = ['0:0:0:0:0:FFFF:', '::FFFF:'];
	for (var i = 0; i < v6prefixes.length; i++) {
		var v6prefix = v6prefixes[i];
		if (ipv6.indexOf(v6prefix) == 0) {
			return ipv6.substring(v6prefix.length);
		}
	}
	return null;
}

async function preloadAsync() {
	var asyncCache = { ...conf4 };
	var mainFh;
	var datSize;

	try {
		var locFh = await fs.promises.open(dataFiles.cityNames, 'r');
		try {
			var locStats = await locFh.stat();
			if (locStats.size === 0) throw { code: 'EMPTY_FILE' };
			asyncCache.locationBuffer = Buffer.alloc(locStats.size);
			await locFh.read(asyncCache.locationBuffer, 0, locStats.size, 0);
		} finally {
			await locFh.close();
		}

		mainFh = await fs.promises.open(dataFiles.city, 'r');
		var cityStats = await mainFh.stat();
		datSize = cityStats.size;
	} catch (err) {
		if (err.code !== 'ENOENT' && err.code !== 'EBADF' && err.code !== 'EMPTY_FILE') {
			if (mainFh) try { await mainFh.close(); } catch { /* ignore close error during cleanup */ }
			throw err;
		}

		mainFh = await fs.promises.open(dataFiles.country, 'r');
		var countryStats = await mainFh.stat();
		datSize = countryStats.size;
		asyncCache.recordSize = RECORD_SIZE;
	}

	try {
		asyncCache.mainBuffer = Buffer.alloc(datSize);
		await mainFh.read(asyncCache.mainBuffer, 0, datSize, 0);
	} finally {
		await mainFh.close();
	}

	asyncCache.lastLine = (datSize / asyncCache.recordSize) - 1;
	asyncCache.lastIP = asyncCache.mainBuffer.readUInt32BE((asyncCache.lastLine * asyncCache.recordSize) + 4);
	asyncCache.firstIP = asyncCache.mainBuffer.readUInt32BE(0);
	cache4 = asyncCache;
}

function preload(callback) {
	if (typeof callback === 'function') {
		preloadAsync().then(function () { callback(null); }, callback);
		return;
	}

	var datFile;
	var datSize;

	try {
		datFile = fs.openSync(dataFiles.cityNames, 'r');
		datSize = fs.fstatSync(datFile).size;

		if (datSize === 0) {
			throw {
				code: 'EMPTY_FILE'
			};
		}

		cache4.locationBuffer = Buffer.alloc(datSize);
		fs.readSync(datFile, cache4.locationBuffer, 0, datSize, 0);
		fs.closeSync(datFile);

		datFile = fs.openSync(dataFiles.city, 'r');
		datSize = fs.fstatSync(datFile).size;
	} catch(err) {
		if (err.code !== 'ENOENT' && err.code !== 'EBADF' && err.code !== 'EMPTY_FILE') {
			throw err;
		}

		datFile = fs.openSync(dataFiles.country, 'r');
		datSize = fs.fstatSync(datFile).size;
		cache4.recordSize = RECORD_SIZE;
	}

	cache4.mainBuffer = Buffer.alloc(datSize);
	fs.readSync(datFile, cache4.mainBuffer, 0, datSize, 0);

	fs.closeSync(datFile);

	cache4.lastLine = (datSize / cache4.recordSize) - 1;
	cache4.lastIP = cache4.mainBuffer.readUInt32BE((cache4.lastLine * cache4.recordSize) + 4);
	cache4.firstIP = cache4.mainBuffer.readUInt32BE(0);
}

async function preload6Async() {
	var asyncCache6 = { ...conf6 };
	var mainFh;
	var datSize;

	try {
		mainFh = await fs.promises.open(dataFiles.city6, 'r');
		var cityStats = await mainFh.stat();
		datSize = cityStats.size;
		if (datSize === 0) {
			await mainFh.close();
			mainFh = null;
			throw { code: 'EMPTY_FILE' };
		}
	} catch (err) {
		if (err.code !== 'ENOENT' && err.code !== 'EBADF' && err.code !== 'EMPTY_FILE') {
			if (mainFh) try { await mainFh.close(); } catch { /* ignore close error during cleanup */ }
			throw err;
		}

		mainFh = await fs.promises.open(dataFiles.country6, 'r');
		var countryStats = await mainFh.stat();
		datSize = countryStats.size;
		asyncCache6.recordSize = RECORD_SIZE6;
	}

	try {
		asyncCache6.mainBuffer = Buffer.alloc(datSize);
		await mainFh.read(asyncCache6.mainBuffer, 0, datSize, 0);
	} finally {
		await mainFh.close();
	}

	asyncCache6.lastLine = (datSize / asyncCache6.recordSize) - 1;
	asyncCache6.lastIP = readip6(asyncCache6.mainBuffer, asyncCache6.recordSize, asyncCache6.lastLine, 1);
	asyncCache6.firstIP = readip6(asyncCache6.mainBuffer, asyncCache6.recordSize, 0, 0);
	cache6 = asyncCache6;
}

function preload6(callback) {
	if (typeof callback === 'function') {
		preload6Async().then(function () { callback(null); }, callback);
		return;
	}

	var datFile;
	var datSize;

	try {
		datFile = fs.openSync(dataFiles.city6, 'r');
		datSize = fs.fstatSync(datFile).size;

		if (datSize === 0) {
			throw {
				code: 'EMPTY_FILE'
			};
		}
	} catch(err) {
		if (err.code !== 'ENOENT' && err.code !== 'EBADF' && err.code !== 'EMPTY_FILE') {
			throw err;
		}

		datFile = fs.openSync(dataFiles.country6, 'r');
		datSize = fs.fstatSync(datFile).size;
		cache6.recordSize = RECORD_SIZE6;
	}

	cache6.mainBuffer = Buffer.alloc(datSize);
	fs.readSync(datFile, cache6.mainBuffer, 0, datSize, 0);

	fs.closeSync(datFile);

	cache6.lastLine = (datSize / cache6.recordSize) - 1;
	cache6.lastIP = readip6(cache6.mainBuffer, cache6.recordSize, cache6.lastLine, 1);
	cache6.firstIP = readip6(cache6.mainBuffer, cache6.recordSize, 0, 0);
}

module.exports = {
	cmp: utils.cmp,

	lookup: function(ip) {
		if (!ip) {
			return null;
		} else if (typeof ip === 'number') {
			return lookup4(ip);
		}

		var ver = net.isIP(ip);
		if (ver === 4) {
			return lookup4(utils.aton4(ip));
		} else if (ver === 6) {
			var ipv4 = get4mapped(ip);
			if (ipv4) {
				return lookup4(utils.aton4(ipv4));
			} else {
				return lookup6(utils.aton6(ip));
			}
		}

		return null;
	},

	pretty: function(n) {
		if (typeof n === 'string') {
			return n;
		} else if (typeof n === 'number') {
			return utils.ntoa4(n);
		} else if (n instanceof Array) {
			return utils.ntoa6(n);
		}

		return n;
	},

	// Start watching for data updates. The watcher waits one minute for file transfer to 
	// completete before triggering the callback.
	startWatchingDataUpdate: function (callback) {
		fsWatcher.makeFsWatchFilter(watcherName, geodatadir, 60*1000, function () {
			preloadAsync()
				.then(function () { return preload6Async(); })
				.then(function () { callback(null); }, callback);
		});
	},

	// Stop watching for data updates.
	stopWatchingDataUpdate: function () {
		fsWatcher.stopWatching(watcherName);
	},
    
	//clear data
	clear: function () {
		cache4 = { ...conf4 };
		cache6 = { ...conf6 };
	},
	
	// Reload data synchronously
	reloadDataSync: function () {
		preload();
		preload6();
	},
	
	// Reload data asynchronously
	reloadData: function (callback) {
		preloadAsync()
			.then(function () { return preload6Async(); })
			.then(function () { callback(null); }, callback);
	},
};

preload();
preload6();
