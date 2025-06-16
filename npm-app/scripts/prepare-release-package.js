#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Copy the release package.json template
const releasePackageJson = require('../package-release.json')
const currentPackageJson = require('../package.json')

// Update version from current package.json
releasePackageJson.version = currentPackageJson.version

// Backup the original package.json
const originalPackageJsonPath = path.join(__dirname, '..', 'package.json')
const backupPackageJsonPath = path.join(__dirname, '..', 'package.json.backup')

fs.copyFileSync(originalPackageJsonPath, backupPackageJsonPath)

// Write the release package.json
fs.writeFileSync(
  originalPackageJsonPath,
  JSON.stringify(releasePackageJson, null, 2) + '\n'
)

console.log('✅ Package prepared for release distribution')
console.log(`Version: ${releasePackageJson.version}`)
