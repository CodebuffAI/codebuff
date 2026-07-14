#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const packageDir = process.cwd()
const packageJson = JSON.parse(
  fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
)
const supportedPackages = new Set(['codebuff', 'codecane', 'freebuff'])

if (!supportedPackages.has(packageJson.name)) {
  throw new Error(
    `Refusing to prepare unexpected release package: ${packageJson.name}`,
  )
}

const generatedFiles = ['launcher.js', 'http.js']

for (const fileName of generatedFiles) {
  const destinationPath = path.join(packageDir, fileName)
  if (process.argv.includes('--clean')) {
    fs.rmSync(destinationPath, { force: true })
  } else {
    fs.copyFileSync(path.join(__dirname, fileName), destinationPath)
  }
}
