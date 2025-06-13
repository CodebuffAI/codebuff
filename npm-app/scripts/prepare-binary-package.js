#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Copy the binary package.json template
const binaryPackageJson = require('../package-binary.json')
const currentPackageJson = require('../package.json')

// Update version from current package.json
binaryPackageJson.version = currentPackageJson.version

// Write the binary package.json
fs.writeFileSync(
  path.join(__dirname, '..', 'package.json'),
  JSON.stringify(binaryPackageJson, null, 2) + '\n'
)

console.log('✅ Package prepared for binary distribution')
