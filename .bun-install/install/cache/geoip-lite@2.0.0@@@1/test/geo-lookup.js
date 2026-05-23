var assert = require('assert');
var t1 =+ new Date();
var geoip = require('../lib/geoip');
var t2 =+ new Date();

if (process.argv.length > 2) {
	console.dir(geoip.lookup(process.argv[2]));
	var t3 =+ new Date();
	console.log('Startup: %dms, exec: %dms', t2 - t1, t3 - t2);
	process.exit();
}

var f = [];
var ip;
var n = 30000;
var nf = [];
var r;
var ts =+ new Date();

for (var i = 0; i < n; i++) {
	if ((i % 2) === 0) {
		ip = Math.round((Math.random() * 0xff000000)+ 0xffffff);
	} else {
		ip = '2001:' +
			Math.round(Math.random()*0xffff).toString(16) + ':' +
			Math.round(Math.random()*0xffff).toString(16) + ':' +
			Math.round(Math.random()*0xffff).toString(16) + ':' +
			Math.round(Math.random()*0xffff).toString(16) + ':' +
			Math.round(Math.random()*0xffff).toString(16) + ':' +
			Math.round(Math.random()*0xffff).toString(16) + ':' +
			Math.round(Math.random()*0xffff).toString(16) + '';
	}

	r = geoip.lookup(ip);

	if (r === null) {
		nf.push(ip);
		continue;
	}

	f.push([ip, r]);

	assert.ok(geoip.cmp(ip, r.range[0]) >= 0 , 'Problem with ' + geoip.pretty(ip) + ' < ' + geoip.pretty(r.range[0]));
	assert.ok(geoip.cmp(ip, r.range[1]) <= 0 , 'Problem with ' + geoip.pretty(ip) + ' > ' + geoip.pretty(r.range[1]));
}

var te =+ new Date();

/*
f.forEach(function(ip) {
	console.log("%s bw %s & %s is %s", geoip.pretty(ip[0]), geoip.pretty(ip[1].range[0]), geoip.pretty(ip[1].range[1]), ip[1].country);
});
*/

console.log("Found %d (%d/%d) ips in %dms (%s ip/s) (%sμs/ip)", n, f.length, nf.length, te-ts, (n*1000 / (te-ts)).toFixed(3), ((te-ts) * 1000 / n).toFixed(0));
console.log("Took %d ms to startup", t2 - t1);