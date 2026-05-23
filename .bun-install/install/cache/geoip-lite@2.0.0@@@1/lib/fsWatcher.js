var fs = require('fs'),
	path = require('path'),
	FSWatcher = {};

/**
 * Takes a directory/file and watch for change. Upon change, call the
 * callback.
 *
 * @param {String} name: name of this watcher
 * @param {String} directory: path to the directory to watch
 * @param {String} [filename]: (optional) specific filename to watch for,
 *     watches for all files in the directory if unspecified
 * @param {Integer} cooldownDelay: delay to wait before triggering the callback
 * @param {Function} callback: function () : called when changes are detected
**/
function makeFsWatchFilter(name, directory, filename, cooldownDelay, callback) {
	var cooldownId = null;

	//Delete the cooldownId and callback the outer function
	function timeoutCallback() {
		cooldownId = null;
		callback();
	}

	//This function is called when there is a change in the data directory
	//It sets a timer to wait for the change to be completed
	function onWatchEvent(event, changedFile) {
		// check to make sure changedFile is not null
		if (!changedFile) {
			return;
		}
		
		var filePath = path.join(directory, changedFile);

		if (!filename || filename === changedFile) {
			fs.access(filePath, fs.constants.F_OK, function onAccess(err) {
				if (err) {
					// if the changed file no longer exists, it was a deletion.
					// we ignore deleted files
					return;
				}

				//At this point, a new file system activity has been detected,
				//We have to wait for file transfert to be finished before moving on.

				//If a cooldownId already exists, we delete it
				if (cooldownId !== null) {
					clearTimeout(cooldownId);
					cooldownId = null;
				}

				//Once the cooldownDelay has passed, the timeoutCallback function will be called
				cooldownId = setTimeout(timeoutCallback, cooldownDelay);
			});
		}
	}

	//Manage the case where filename is missing (because it's optionnal)
	if (typeof cooldownDelay === 'function') {
		callback = cooldownDelay;
		cooldownDelay = filename;
		filename = null;
	}

	if (FSWatcher[name]) {
		stopWatching(name);
	}

	FSWatcher[name] = fs.watch(directory, onWatchEvent);
}

/**
 * Take a FSWatcher object and close it.
 *
 * @param {string} name: name of the watcher to close
 *
**/
function stopWatching(name) {
	FSWatcher[name].close();
}

module.exports.makeFsWatchFilter = makeFsWatchFilter;
module.exports.stopWatching = stopWatching;
