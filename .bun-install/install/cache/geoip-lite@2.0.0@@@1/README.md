GeoIP-lite
==========

A native NodeJS API for the GeoLite data from MaxMind.

This product includes GeoLite data created by MaxMind, available from http://maxmind.com/

**NOTE** You MUST update the data files after installation. The MaxMind license does not allow us to distribute
the latest version of the data files with this package.  Follow the instructions under [update the datafiles](#2-update-the-datafiles-optional)
for details.

introduction
------------

MaxMind provides a set of data files for IP to Geo mapping along with opensource libraries to parse and lookup these data files.
One would typically write a wrapper around their C API to get access to this data in other languages (like JavaScript).

GeoIP-lite instead attempts to be a fully native JavaScript library.  A converter script converts the CSV files from MaxMind into
an internal binary format (note that this is different from the binary data format provided by MaxMind).  The geoip module uses this
binary file to lookup IP addresses and return the country, region and city that it maps to.

Both IPv4 and IPv6 addresses are supported, however since the GeoLite IPv6 database does not currently contain any city or region
information, city, region and postal code lookups are only supported for IPv4.

philosophy
----------

I was really aiming for a fast JavaScript native implementation for geomapping of IPs.  My prime motivator was the fact that it was
really hard to get libgeoip built for Mac OSX without using the library from MacPorts.

why geoip-lite
--------------

`geoip-lite` is a fully JavaScript implementation of the MaxMind geoip API.  It is not as fully featured as bindings that use `libgeoip`.
By reducing scope, this package is significantly faster at doing lookups.  On average, an IPv4 lookup takes under 0.5 microseconds and
an IPv6 lookup takes about 1.3 microseconds.

synopsis
--------

```javascript
var geoip = require('geoip-lite');

var ip = "207.97.227.239";
var geo = geoip.lookup(ip);

console.log(geo);
{ range: [ 3479298048, 3479300095 ],
  country: 'US',
  region: 'TX',
  eu: '0',
  timezone: 'America/Chicago',
  city: 'San Antonio',
  ll: [ 29.4969, -98.4032 ],
  metro: 641,
  area: 1000 }

```

requirements
------------

- Node.js >= 24.0.0

installation
------------
### 1. get the library

    $ npm install geoip-lite

### 2. update the datafiles (optional)

Run `cd node_modules/geoip-lite && npm run-script updatedb license_key=YOUR_LICENSE_KEY` to update the data files. (Replace `YOUR_LICENSE_KEY` with your license key obtained from [maxmind.com](https://support.maxmind.com/hc/en-us/articles/4407111582235-Generate-a-License-Key))

You can create a maxmind account [here](https://www.maxmind.com/en/geolite2/signup)

**NOTE** that this requires a lot of RAM.  It is known to fail on on a Digital Ocean or AWS micro instance.
There are no plans to change this.  `geoip-lite` stores all data in RAM in order to be fast.

API
---

geoip-lite is completely synchronous.  There are no callbacks involved.  All blocking file IO is done at startup time, so all runtime
calls are executed in-memory and are fast.  Startup may take up to 200ms while it reads into memory and indexes data files.

### Looking up an IP address ###

If you have an IP address in dotted quad notation, IPv6 colon notation, or a 32 bit unsigned integer (treated
as an IPv4 address), pass it to the `lookup` method.  Note that you should remove any `[` and `]` around an
IPv6 address before passing it to this method.

```javascript
var geo = geoip.lookup(ip);
```

If the IP address was found, the `lookup` method returns an object with the following structure:

```javascript
{
   range: [ <low bound of IP block>, <high bound of IP block> ],
   country: 'XX',                 // 2 letter ISO-3166-1 country code
   region: 'RR',                  // Up to 3 alphanumeric variable length characters as ISO 3166-2 code
                                  // For US states this is the 2 letter state
                                  // For the United Kingdom this could be ENG as a country like “England
                                  // FIPS 10-4 subcountry code
   eu: '0',                       // 1 if the country is a member state of the European Union, 0 otherwise.
   timezone: 'Country/Zone',      // Timezone from IANA Time Zone Database
   city: "City Name",             // This is the full city name
   ll: [<latitude>, <longitude>], // The latitude and longitude of the city
   metro: <metro code>,           // Metro code
   area: <accuracy_radius>        // The approximate accuracy radius (km), around the latitude and longitude
}
```

The actual values for the `range` array depend on whether the IP is IPv4 or IPv6 and should be
considered internal to `geoip-lite`.  To get a human readable format, pass them to `geoip.pretty()`

If the IP address was not found, the `lookup` returns `null`

### Pretty printing an IP address ###

If you have a 32 bit unsigned integer, or a number returned as part of the `range` array from the `lookup` method,
the `pretty` method can be used to turn it into a human readable string.

```javascript
    console.log("The IP is %s", geoip.pretty(ip));
```

This method returns a string if the input was in a format that `geoip-lite` can recognise, else it returns the
input itself.

Built-in Updater
----------------

This package contains an update script that can pull the files from MaxMind and handle the conversion from CSV.
A npm script alias has been setup to make this process easy. Please keep in mind this requires internet and MaxMind
rate limits that amount of downloads on their servers.

You will need, at minimum, a free license key obtained from [maxmind.com](https://support.maxmind.com/hc/en-us/articles/4407111582235-Generate-a-License-Key) to run the update script.

Package stores checksums of MaxMind data and by default only downloads them if checksums have changed.

### Ways to update data ###

```shell
#update data if new data is available
npm run-script updatedb license_key=YOUR_LICENSE_KEY

#force udpate data even if checkums have not changed
npm run-script updatedb-force license_key=YOUR_LICENSE_KEY
```

You can also run it by doing:

```bash
node ./node_modules/geoip-lite/scripts/updatedb.js license_key=YOUR_LICENSE_KEY
```

### Ways to reload data in your app when update finished ###

If you have a server running `geoip-lite`, and you want to reload its geo data, after you finished update, without a restart.

#### Programmatically ####

You can do it programmatically, calling after scheduled data updates

```javascript
//Synchronously
geoip.reloadDataSync();

//Asynchronously
geoip.reloadData(function(){
    console.log("Done");
});
```

#### Automatic Start and stop watching for data updates ####

You can enable the data watcher to automatically refresh in-memory geo data when a file changes in the data directory.

```javascript
geoip.startWatchingDataUpdate();
```

This tool can be used with `npm run-script updatedb` to periodically update geo data on a running server.

#### Environment variables

The following environment variables can be set.

```bash
# Override the default node_modules/geoip-lite/tmp dir
GEOTMPDIR=/some/path

# Override the default node_modules/geoip-lite/data dir
GEODATADIR=/some/path
```

Caveats
-------

This package includes the GeoLite database from MaxMind.  This database is not the most accurate database available,
however it is the best available for free.  You can use the commercial GeoIP database from MaxMind with better
accuracy by buying a license from MaxMind, and then using the conversion utility to convert it to a format that
geoip-lite understands.  You will need to use the `.csv` files from MaxMind for conversion.

Also note that on occassion, the library may take up to 5 seconds to load into memory.  This is largely dependent on
how busy your disk is at that time.  It can take as little as 200ms on a lightly loaded disk.  This is a one time
cost though, and you make it up at run time with very fast lookups.

### Memory usage ###

Quick test on memory consumption shows that the library uses around 135 MB RSS per process, with the
bulk of that being the binary data buffers held in external memory.

```javascript
    var geoip = require('geoip-lite');
    console.log(process.memoryUsage());
    /**
    * Outputs:
    * {
    *     rss: 141557760,
    *     heapTotal: 6815744,
    *     heapUsed: 4063232,
    *     external: 110378968,
    *     arrayBuffers: 108851048
    * }
    **/
```

Alternatives
----------
If your use-case requires doing less than 100 queries through the lifetime of your application or if you need really fast latency on start-up, you might want to look into [fast-geoip](https://github.com/onramper/fast-geoip) a package with a compatible API that is optimized for serverless environments and provides faster boot times and lower memory consumption at the expense of longer lookup times.

References
----------
  - <a href="http://www.maxmind.com/app/iso3166">Documentation from MaxMind</a>
  - <a href="http://en.wikipedia.org/wiki/ISO_3166">ISO 3166 (1 & 2) codes</a>
  - <a href="http://en.wikipedia.org/wiki/List_of_FIPS_region_codes">FIPS region codes</a>

Copyright
---------

`geoip-lite` is Copyright Philip Tellis <philip@bluesmoon.info> and other contributors, and the latest version of the code is
available at https://github.com/bluesmoon/node-geoip

License
-------

There are two licenses for the code and data.  See the [LICENSE](https://github.com/bluesmoon/node-geoip/blob/master/LICENSE) file for details.
