#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const originalPackageJsonPath = path.join(__dirname, '..', 'package.json')
const backupPackageJsonPath = path.join(__dirname, '..', 'package.json.backup')

if (fs.existsSync(backupPackageJsonPath)) {
  fs.copyFileSync(backupPackageJsonPath, originalPackageJsonPath)
  fs.unlinkSync(backupPackageJsonPath)
  console.log('✅ Original package.json restored')
} else {
  console.log('⚠️  No backup found, package.json unchanged')
}
