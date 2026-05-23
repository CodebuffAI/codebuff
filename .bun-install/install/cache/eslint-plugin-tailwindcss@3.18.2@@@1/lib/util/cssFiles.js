'use strict';

const fg = require('fast-glob');
const fs = require('fs');
const postcss = require('postcss');
const lastClassFromSelectorRegexp = /\.([^\.\,\s\n\:\(\)\[\]\'~\+\>\*\\]*)/gim;
const removeDuplicatesFromArray = require('./removeDuplicatesFromArray');

const cssFilesInfos = new Map();
let lastUpdate = null;
let classnamesFromFiles = [];

/**
 * Read CSS files and extract classnames
 * @param {Array} patterns Glob patterns to locate files
 * @param {Number} refreshRate Interval
 * @returns {Array} List of classnames
 */
const generateClassnamesListSync = (patterns, refreshRate = 5_000) => {
  const now = Date.now();
  const isExpired = lastUpdate === null || now - lastUpdate > refreshRate;

  if (!isExpired) {
    // console.log(`generateClassnamesListSync from cache (${classnamesFromFiles.length} classes)`);
    return classnamesFromFiles;
  }

  // console.log('generateClassnamesListSync EXPIRED');
  // Update classnames from CSS files
  lastUpdate = now;
  const filesToBeRemoved = new Set([...cssFilesInfos.keys()]);
  const files = fg.sync(patterns, { suppressErrors: true, stats: true });
  for (const file of files) {
    let mtime = '';
    let canBeSkipped = cssFilesInfos.has(file.path);
    if (canBeSkipped) {
      // This file is still used
      filesToBeRemoved.delete(file.path);
      // Check modification date
      const stats = fs.statSync(file.path);
      mtime = `${stats.mtime || ''}`;
      canBeSkipped = cssFilesInfos.get(file.path).mtime === mtime;
    }
    if (canBeSkipped) {
      // File did not change since last run
      continue;
    }
    // Parse CSS file
    const data = fs.readFileSync(file.path, 'utf-8');
    const root = postcss.parse(data);
    let detectedClassnames = new Set();
    root.walkRules((rule) => {
      const matches = [...rule.selector.matchAll(lastClassFromSelectorRegexp)];
      const classnames = matches.map((arr) => arr[1]);
      detectedClassnames = new Set([...detectedClassnames, ...classnames]);
    });
    // Save the detected classnames
    cssFilesInfos.set(file.path, {
      mtime: mtime,
      classNames: [...detectedClassnames],
    });
  }
  // Remove erased CSS from the Map
  const deletedFiles = [...filesToBeRemoved];
  for (let i = 0; i < deletedFiles.length; i++) {
    cssFilesInfos.delete(deletedFiles[i]);
  }
  // Build the final list
  classnamesFromFiles = [];
  cssFilesInfos.forEach((css) => {
    classnamesFromFiles = [...classnamesFromFiles, ...css.classNames];
  });
  // Unique classnames
  return removeDuplicatesFromArray(classnamesFromFiles);
};

module.exports = generateClassnamesListSync;
