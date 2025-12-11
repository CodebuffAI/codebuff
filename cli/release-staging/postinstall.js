#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

// Clean up old binary
const binaryPath = path.join(
  os.homedir(),
  '.config',
  'manicode',
  process.platform === 'win32' ? 'codecane.exe' : 'codecane'
);

try {
  fs.unlinkSync(binaryPath);
} catch (e) {
  /* ignore if file doesn't exist */
}

// Print welcome message
console.log('\n');
console.log('🧪 Welcome to Codecane (Staging)!');
console.log('\n');
console.log('⚠️  This is a staging/beta release for testing purposes.');
console.log('\n');
console.log('To get started:');
console.log('  1. cd to your project directory');
console.log('  2. Run: codecane');
console.log('\n');
console.log('Example:');
console.log('  $ cd ~/my-project');
console.log('  $ codecane');
console.log('\n');
console.log('For more information, visit: https://codebuff.com/docs');
console.log('\n');
