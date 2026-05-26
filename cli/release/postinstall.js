#!/usr/bin/env node

const fs = require('fs');
const os = require('os');
const path = require('path');

// Clean up managed binaries so the wrapper downloads a fresh copy.
const configDir = path.join(os.homedir(), '.config', 'manicode');
const binaryNames = process.platform === 'win32'
  ? ['openbuff.exe', 'codebuff.exe']
  : ['openbuff', 'codebuff'];

for (const binaryName of binaryNames) {
  try {
    fs.unlinkSync(path.join(configDir, binaryName));
  } catch (e) {
    /* ignore if file doesn't exist */
  }
}

// Print welcome message
console.log('\n');
console.log('🎉 Welcome to Openbuff!');
console.log('\n');
console.log('To get started:');
console.log('  1. cd to your project directory');
console.log('  2. Run: openbuff');
console.log('\n');
console.log('Example:');
console.log('  $ cd ~/my-project');
console.log('  $ openbuff');
console.log('\n');
console.log('For more information, visit: https://github.com/nicholasgriffintn/openbuff');
console.log('\n');
