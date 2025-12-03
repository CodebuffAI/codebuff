#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

// Clean up old binary
const binaryPath = path.join(
  os.homedir(),
  '.config',
  'manicode',
  process.platform === 'win32' ? 'codebuff.exe' : 'codebuff'
);

try {
  fs.unlinkSync(binaryPath);
} catch (e) {
  /* ignore if file doesn't exist */
}

// Print welcome message
console.log('\n');
console.log('🎉 Welcome to Codebuff!');
console.log('\n');
console.log('To get started:');
console.log('  1. cd to your project directory');
console.log('  2. Run: codebuff');
console.log('\n');
console.log('Example:');
console.log('  $ cd ~/my-project');
console.log('  $ codebuff');
console.log('\n');
console.log('For more information, visit: https://codebuff.com/docs');
console.log('\n');
