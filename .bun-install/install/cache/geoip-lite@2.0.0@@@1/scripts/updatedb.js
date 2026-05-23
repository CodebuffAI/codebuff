// fetches and converts maxmind lite databases

'use strict';

var user_agent = 'Mozilla/5.0 (Windows NT 6.1; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/39.0.2171.36 Safari/537.36';

var fs = require('fs');
var http = require('http');
var https = require('https');
var path = require('path');
var zlib = require('zlib');
var readline = require('readline');

var chalk = require('chalk');
var iconv = require('iconv-lite');
var lazy = require('lazy');
var yauzl = require('yauzl');
var utils = require('../lib/utils');
var Address6 = require('ip-address').Address6;
var Address4 = require('ip-address').Address4;

var args = process.argv.slice(2);
var license_key = args.find(function(arg) {
	return arg.match(/^license_key=[a-zA-Z0-9]+/) !== null;
});
if (typeof license_key === 'undefined' && typeof process.env.LICENSE_KEY !== 'undefined') {
	license_key = 'license_key='+process.env.LICENSE_KEY;
}
var geodatadir = args.find(function(arg) {
	return arg.match(/^geodatadir=[\w./]+/) !== null;
});
if (typeof geodatadir === 'undefined' && typeof process.env.GEODATADIR !== 'undefined') {
	geodatadir = 'geodatadir='+process.env.GEODATADIR;
}
var dataPath = path.resolve(__dirname, '..', 'data');
if (typeof geodatadir !== 'undefined') {
	dataPath = path.resolve(process.cwd(), geodatadir.split('=')[1]);
	if (!fs.existsSync(dataPath)) {
		console.log(chalk.red('ERROR') + ': Directory does\'t exist: ' + dataPath);
		process.exit(1);
	}
}
var tmpPath = process.env.GEOTMPDIR ? process.env.GEOTMPDIR : path.resolve(__dirname, '..', 'tmp');
var countryLookup = {};
var cityLookup = {NaN: -1};
var databases = [
	{
		type: 'country',
		url: 'https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country-CSV&suffix=zip&'+license_key,
		checksum: 'https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-Country-CSV&suffix=zip.sha256&'+license_key,
		fileName: 'GeoLite2-Country-CSV.zip',
		src: [
			'GeoLite2-Country-Locations-en.csv',
			'GeoLite2-Country-Blocks-IPv4.csv',
			'GeoLite2-Country-Blocks-IPv6.csv'
		],
		dest: [
			'',
			'geoip-country.dat',
			'geoip-country6.dat'
		]
	},
	{
		type: 'city',
		url: 'https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City-CSV&suffix=zip&'+license_key,
		checksum: 'https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City-CSV&suffix=zip.sha256&'+license_key,
		fileName: 'GeoLite2-City-CSV.zip',
		src: [
			'GeoLite2-City-Locations-en.csv',
			'GeoLite2-City-Blocks-IPv4.csv',
			'GeoLite2-City-Blocks-IPv6.csv'
		],
		dest: [
			'geoip-city-names.dat',
			'geoip-city.dat',
			'geoip-city6.dat'
		]
	}
];

function mkdir(name) {
	var dir = path.dirname(name);
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir);
	}
}

// Ref: http://stackoverflow.com/questions/8493195/how-can-i-parse-a-csv-string-with-javascript
// Return array of string values, or NULL if CSV string not well formed.
// Return array of string values, or NULL if CSV string not well formed.

function try_fixing_line(line) {
	var pos1 = 0;
	var pos2 = -1;
	// escape quotes
	line = line.replace(/""/,'\\"').replace(/'/g,"\\'");
	
	while(pos1 < line.length && pos2 < line.length) {
		pos1 = pos2;
		pos2 = line.indexOf(',', pos1 + 1);
		if(pos2 < 0) pos2 = line.length;
		if(line.indexOf("'", (pos1 || 0)) > -1 && line.indexOf("'", pos1) < pos2 && line[pos1 + 1] != '"' && line[pos2 - 1] != '"') {
			line = line.substr(0, pos1 + 1) + '"' + line.substr(pos1 + 1, pos2 - pos1 - 1) + '"' + line.substr(pos2, line.length - pos2);
			pos2 = line.indexOf(',', pos2 + 1);
			if(pos2 < 0) pos2 = line.length;
		}
	}
	return line;
}

function CSVtoArray(text) {
	var re_valid = /^\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*(?:,\s*(?:'[^'\\]*(?:\\[\S\s][^'\\]*)*'|"[^"\\]*(?:\\[\S\s][^"\\]*)*"|[^,'"\s\\]*(?:\s+[^,'"\s\\]+)*)\s*)*$/;
	var re_value = /(?!\s*$)\s*(?:'([^'\\]*(?:\\[\S\s][^'\\]*)*)'|"([^"\\]*(?:\\[\S\s][^"\\]*)*)"|([^,'"\s\\]*(?:\s+[^,'"\s\\]+)*))\s*(?:,|$)/g;
	// Return NULL if input string is not well formed CSV string.
	if (!re_valid.test(text)){
		text  = try_fixing_line(text);
		if(!re_valid.test(text))
			return null;
	}
	var a = []; // Initialize array to receive values.
	text.replace(re_value, // "Walk" the string using replace with callback.
		function(m0, m1, m2, m3) {
			// Remove backslash from \' in single quoted values.
			if      (m1 !== undefined) a.push(m1.replace(/\\'/g, "'"));
			// Remove backslash from \" in double quoted values.
			else if (m2 !== undefined) a.push(m2.replace(/\\"/g, '"').replace(/\\'/g, "'"));
			else if (m3 !== undefined) a.push(m3);
			return ''; // Return empty string.
		});
	// Handle special case of empty last value.
	if (/,\s*$/.test(text)) a.push('');
	return a;
}

function getHTTPOptions(downloadUrl) {
	var parsedUrl = new URL(downloadUrl);
	var options = {
		protocol: parsedUrl.protocol,
		hostname: parsedUrl.hostname,
		port: parsedUrl.port,
		path: parsedUrl.pathname + parsedUrl.search,
		headers: {
			'User-Agent': user_agent
		}
	};

	if (process.env.http_proxy || process.env.https_proxy) {
		try {
			var HttpsProxyAgentModule = require('https-proxy-agent');
			// Handle both v5/v6 (default export) and v7+ (named export) formats
			var HttpsProxyAgent = typeof HttpsProxyAgentModule === 'function'
				? HttpsProxyAgentModule
				: (HttpsProxyAgentModule.HttpsProxyAgent || HttpsProxyAgentModule.default || HttpsProxyAgentModule);
			options.agent = new HttpsProxyAgent(process.env.http_proxy || process.env.https_proxy);
		}
		catch {
			console.error("Install https-proxy-agent to use an HTTP/HTTPS proxy");
			process.exit(-1);
		}
	}

	return options;
}

function check(database, cb) {
	if (args.indexOf("force") !== -1) {
		//we are forcing database upgrade,
		//so not even using checksums
		return cb(null, database);
	}
	
	var checksumUrl = database.checksum;
    
	if (typeof checksumUrl === "undefined") {
		//no checksum url to check, skipping
		return cb(null, database);
	}
    
	//read existing checksum file
	fs.readFile(path.join(dataPath, database.type+".checksum"), {encoding: 'utf8'}, function(err, data) {
		if (!err && data && data.length) {
			database.checkValue = data;
		}
		
		console.log('Checking ', database.fileName);
        
		function onResponse(response) {
			var status = response.statusCode;

			if(status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
				return https.get(getHTTPOptions(response.headers.location), onResponse);
			} else if (status !== 200) {
				console.log(chalk.red('ERROR') + ': HTTP Request Failed [%d %s]', status, http.STATUS_CODES[status]);
				client.destroy();
				process.exit(1);
			}
    
			var str = "";
			response.on("data", function (chunk) {
				str += chunk;
			});
            
			response.on("end", function () {
				if (str && str.length) {
					if (str == database.checkValue) {
						console.log(chalk.green('Database "' + database.type + '" is up to date'));
						database.skip = true;
					}
					else {
						console.log(chalk.green('Database ' + database.type + ' has new data'));
						database.checkValue = str;
					}
				}
				else {
					console.log(chalk.red('ERROR') + ': Could not retrieve checksum for', database.type, chalk.red('Aborting'));
					console.log('Run with "force" to update without checksum');
					client.destroy();
					process.exit(1);
				}
				cb(null, database);
			});
		}
        
		var client = https.get(getHTTPOptions(checksumUrl), onResponse);
	});
}

function fetch(database, cb) {
    
	if (database.skip) {
		return cb(null, null, null, database);
	}

	var downloadUrl = database.url;
	var fileName = database.fileName;
	var gzip = path.extname(fileName) === '.gz';

	if (gzip) {
		fileName = fileName.replace('.gz', '');
	}

	var tmpFile = path.join(tmpPath, fileName);

	if (fs.existsSync(tmpFile)) {
		return cb(null, tmpFile, fileName, database);
	}

	console.log('Fetching ', fileName);

	function onResponse(response) {
		var status = response.statusCode;

		if(status === 301 || status === 302 || status === 303 || status === 307 || status === 308) {
			return https.get(getHTTPOptions(response.headers.location), onResponse);
		} else if (status !== 200) {
			console.log(chalk.red('ERROR') + ': HTTP Request Failed [%d %s]', status, http.STATUS_CODES[status]);
			client.destroy();
			process.exit(1);
		}

		var tmpFilePipe;
		var tmpFileStream = fs.createWriteStream(tmpFile);

		if (gzip) {
			tmpFilePipe = response.pipe(zlib.createGunzip()).pipe(tmpFileStream);
		} else {
			tmpFilePipe = response.pipe(tmpFileStream);
		}

		tmpFilePipe.on('close', function() {
			console.log(chalk.green(' DONE'));
			cb(null, tmpFile, fileName, database);
		});
	}

	mkdir(tmpFile);

	var client = https.get(getHTTPOptions(downloadUrl), onResponse);

	process.stdout.write('Retrieving ' + fileName + ' ...');
}

function extract(tmpFile, tmpFileName, database, cb) {
	if (database.skip) {
		return cb(null, database);
	}
	
	if (path.extname(tmpFileName) !== '.zip') {
		cb(null, database);
	} else {
		process.stdout.write('Extracting ' + tmpFileName + ' ...');
		yauzl.open(tmpFile, {autoClose: true, lazyEntries: true}, function(err, zipfile) {
			if (err) {
				throw err;
			}
			zipfile.readEntry();
			zipfile.on("entry", function(entry) {
				if (/\/$/.test(entry.fileName)) {
					// Directory file names end with '/'.
					// Note that entries for directories themselves are optional.
					// An entry's fileName implicitly requires its parent directories to exist.
					zipfile.readEntry();
				} else {
					// file entry
					zipfile.openReadStream(entry, function(err, readStream) {
						if (err) {
							throw err;
						}
						readStream.on("end", function() {
							zipfile.readEntry();
						});
						var filePath = entry.fileName.split("/");
						// filePath will always have length >= 1, as split() always returns an array of at least one string
						var fileName = filePath[filePath.length - 1]; 
						readStream.pipe(fs.createWriteStream(path.join(tmpPath, fileName)));
					});
				}
			});
			zipfile.once("end", function() {
				console.log(chalk.green(' DONE'));
				cb(null, database);
			});
		});
	}
}

function processLookupCountry(src, cb){
	function processLine(line) {
		var fields = CSVtoArray(line);
		if (!fields || fields.length < 6) {
			console.log("weird line: %s::", line);
			return;
		}
		countryLookup[fields[0]] = fields[4];
	}
	var tmpDataFile = path.join(tmpPath, src);

	process.stdout.write('Processing Lookup Data (may take a moment) ...');

	lazy(fs.createReadStream(tmpDataFile))
		.lines
		.map(function(byteArray) {
			return iconv.decode(byteArray, 'latin1');
		})
		.skip(1)
		.map(processLine)
		.on('pipe', function() {
			console.log(chalk.green(' DONE'));
			cb();
		});
}

async function processCountryData(src, dest) {
	var lines=0;
	async function processLine(line) {
		var fields = CSVtoArray(line);

		if (!fields || fields.length < 6) {
			console.log("weird line: %s::", line);
			return;
		}
		lines++;

		var sip;
		var eip;
		var rngip;
		var cc = countryLookup[fields[1]];
		var b;
		var bsz;
		var i;
		if(cc){
			if (fields[0].match(/:/)) {
				// IPv6
				bsz = 34;
				rngip = new Address6(fields[0]);
				sip = utils.aton6(rngip.startAddress().correctForm());
				eip = utils.aton6(rngip.endAddress().correctForm());
	
				b = Buffer.alloc(bsz);
				for (i = 0; i < sip.length; i++) {
					b.writeUInt32BE(sip[i], i * 4);
				}
	
				for (i = 0; i < eip.length; i++) {
					b.writeUInt32BE(eip[i], 16 + (i * 4));
				}
			} else {
				// IPv4
				bsz = 10;

				rngip = new Address4(fields[0]);
				sip = parseInt(rngip.startAddress().bigInteger(),10);
				eip = parseInt(rngip.endAddress().bigInteger(),10);
	
				b = Buffer.alloc(bsz);
				b.fill(0);
				b.writeUInt32BE(sip, 0);
				b.writeUInt32BE(eip, 4);
			}
	
			b.write(cc, bsz - 2);
			if(Date.now() - tstart > 5000) {
				tstart = Date.now();
				process.stdout.write('\nStill working (' + lines + ') ...');
			}

			if(datFile._writableState.needDrain) {
				return new Promise((resolve) => {
					datFile.write(b, resolve);
				});
			} else {
				return datFile.write(b);
			}
		}
	}

	var dataFile = path.join(dataPath, dest);
	var tmpDataFile = path.join(tmpPath, src);

	fs.rmSync(dataFile, { force: true });
	mkdir(dataFile);

	process.stdout.write('Processing Data (may take a moment) ...');
	var tstart = Date.now();
	var datFile = fs.createWriteStream(dataFile);

	var rl = readline.createInterface({
		input: fs.createReadStream(tmpDataFile),
		crlfDelay: Infinity
	});
	var i = 0;
	for await (var line of rl) {
		i++;
		if(i == 1) continue;
		await processLine(line);
	}
	datFile.close();
	console.log(chalk.green(' DONE'));
}

async function processCityData(src, dest) {
	var lines = 0;
	async function processLine(line) {
		if (line.match(/^Copyright/) || !line.match(/\d/)) {
			return;
		}

		var fields = CSVtoArray(line);
		if (!fields) {
			console.log("weird line: %s::", line);
			return;
		}
		var sip;
		var eip;
		var rngip;
		var locId;
		var b;
		var bsz;
		var lat;
		var lon;
		var area;

		var i;

		lines++;

		if (fields[0].match(/:/)) {
			// IPv6
			var offset = 0;
			bsz = 48;
			rngip = new Address6(fields[0]);
			sip = utils.aton6(rngip.startAddress().correctForm());
			eip = utils.aton6(rngip.endAddress().correctForm());
			locId = parseInt(fields[1], 10);
			locId = cityLookup[locId];

			b = Buffer.alloc(bsz);
			b.fill(0);

			for (i = 0; i < sip.length; i++) {
				b.writeUInt32BE(sip[i], offset);
				offset += 4;
			}

			for (i = 0; i < eip.length; i++) {
				b.writeUInt32BE(eip[i], offset);
				offset += 4;
			}
			b.writeUInt32BE(locId>>>0, 32);
			
			lat = Math.round(parseFloat(fields[7]) * 10000);
			lon = Math.round(parseFloat(fields[8]) * 10000);
			area = parseInt(fields[9], 10);
			b.writeInt32BE(lat,36);
			b.writeInt32BE(lon,40);
			b.writeInt32BE(area,44);
		} else {
			// IPv4
			bsz = 24;

			rngip = new Address4(fields[0]);
			sip = parseInt(rngip.startAddress().bigInteger(),10);
			eip = parseInt(rngip.endAddress().bigInteger(),10);
			locId = parseInt(fields[1], 10);
			locId = cityLookup[locId];
			b = Buffer.alloc(bsz);
			b.fill(0);
			b.writeUInt32BE(sip>>>0, 0);
			b.writeUInt32BE(eip>>>0, 4);
			b.writeUInt32BE(locId>>>0, 8);

			lat = Math.round(parseFloat(fields[7]) * 10000);
			lon = Math.round(parseFloat(fields[8]) * 10000);
			area = parseInt(fields[9], 10);
			b.writeInt32BE(lat,12);
			b.writeInt32BE(lon,16);
			b.writeInt32BE(area,20);
		}

		if(Date.now() - tstart > 5000) {
			tstart = Date.now();
			process.stdout.write('\nStill working (' + lines + ') ...');
		}

		if(datFile._writableState.needDrain) {
			return new Promise((resolve) => {
				datFile.write(b, resolve);
			});
		} else {
			return datFile.write(b);
		}
	}

	var dataFile = path.join(dataPath, dest);
	var tmpDataFile = path.join(tmpPath, src);

	fs.rmSync(dataFile, { force: true });

	process.stdout.write('Processing Data (may take a moment) ...');
	var tstart = Date.now();
	var datFile = fs.createWriteStream(dataFile);

	var rl = readline.createInterface({
		input: fs.createReadStream(tmpDataFile),
		crlfDelay: Infinity
	});
	var i = 0;
	for await (var line of rl) {
		i++;
		if(i == 1) continue;
		await processLine(line);
	}
	datFile.close();
}

function processCityDataNames(src, dest, cb) {
	var locId = null;
	var linesCount = 0;
	function processLine(line) {
		if (line.match(/^Copyright/) || !line.match(/\d/)) {
			return;
		}

		var b;
		var sz = 88;
		var fields = CSVtoArray(line);
		if (!fields) {
			//lots of cities contain ` or ' in the name and can't be parsed correctly with current method
			console.log("weird line: %s::", line);
			return;
		}
		
		locId = parseInt(fields[0]);

		cityLookup[locId] = linesCount;
		var cc = fields[4];
		var rg = fields[6];
		var city = fields[10];
		var metro = parseInt(fields[11]);
		//other possible fields to include
		var tz = fields[12];
		var eu = fields[13];

		b = Buffer.alloc(sz);
		b.fill(0);
		b.write(cc, 0);//country code
		b.write(rg, 2);//region

		if(metro) {
			b.writeInt32BE(metro, 5);
		}
		b.write(eu,9);//is in eu
		b.write(tz,10);//timezone
		b.write(city, 42);//cityname

		fs.writeSync(datFile, b, 0, b.length, null);
		linesCount++;
	}

	var dataFile = path.join(dataPath, dest);
	var tmpDataFile = path.join(tmpPath, src);

	fs.rmSync(dataFile, { force: true });

	var datFile = fs.openSync(dataFile, "w");

	lazy(fs.createReadStream(tmpDataFile))
		.lines
		.map(function(byteArray) {
			return iconv.decode(byteArray, 'utf-8');
		})
		.skip(1)
		.map(processLine)
		.on('pipe', cb);
}

function processData(database, cb) {
	if (database.skip) {
		return cb(null, database);
	}
    
	var type = database.type;
	var src = database.src;
	var dest = database.dest;

	if (type === 'country') {
		if(Array.isArray(src)){
			processLookupCountry(src[0], function() {
				processCountryData(src[1], dest[1]).then(() => {
					return processCountryData(src[2], dest[2]);
				}).then(() => {
					cb(null, database);
				});
			});
		}
		else{
			processCountryData(src, dest, function() {
				cb(null, database);
			});
		}
	} else if (type === 'city') {
		processCityDataNames(src[0], dest[0], function() {
			processCityData(src[1], dest[1]).then(() => {
				console.log("city data processed");
				return processCityData(src[2], dest[2]);
			}).then(() => {
				console.log(chalk.green(' DONE'));
				cb(null, database);
			});
		});
	}
}

function updateChecksum(database, cb) {
	if (database.skip || !database.checkValue) {
		//don't need to update checksums cause it was not fetched or did not change
		return cb();
	}
	fs.writeFile(path.join(dataPath, database.type+".checksum"), database.checkValue, 'utf8', function(err){
		if (err) console.log(chalk.red('Failed to Update checksums.'), "Database:", database.type);
		cb();
	});
}

if (!license_key) {
	console.log(chalk.red('ERROR') + ': Missing license_key');
	process.exit(1);
}

function promisifyCallback(fn) {
	return function () {
		var args = Array.prototype.slice.call(arguments);
		return new Promise(function (resolve, reject) {
			args.push(function () {
				var cbArgs = Array.prototype.slice.call(arguments);
				var err = cbArgs.shift();
				if (err) return reject(err);
				resolve(cbArgs);
			});
			fn.apply(null, args);
		});
	};
}

var checkP = promisifyCallback(check);
var fetchP = promisifyCallback(fetch);
var extractP = promisifyCallback(extract);
var processDataP = promisifyCallback(processData);
var updateChecksumP = promisifyCallback(updateChecksum);

fs.rmSync(tmpPath, { recursive: true, force: true });
mkdir(tmpPath);

(async function () {
	for (var i = 0; i < databases.length; i++) {
		var results = await checkP(databases[i]);
		var database = results[0];
		results = await fetchP(database);
		results = await extractP(results[0], results[1], results[2]);
		database = results[0];
		await processDataP(database);
		await updateChecksumP(database);
	}

	console.log(chalk.green('Successfully Updated Databases from MaxMind.'));
	if (args.indexOf("debug") !== -1) {
		console.log(chalk.yellow.bold('Notice: temporary files are not deleted for debug purposes.'));
	} else {
		fs.rmSync(tmpPath, { recursive: true, force: true });
	}
	process.exit(0);
})().catch(function (err) {
	console.log(chalk.red('Failed to Update Databases from MaxMind.'), err);
	process.exit(1);
});
