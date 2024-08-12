const fs = require('fs')
const path = require('path')

const npmAppPackageJsonPath = path.join(
  __dirname,
  '..',
  'npm-app',
  'package.json'
)
const backendPackageJsonPath = path.join(
  __dirname,
  '..',
  'backend',
  'package.json'
)

// Read the npm-app package.json
const npmAppPackageJson = JSON.parse(
  fs.readFileSync(npmAppPackageJsonPath, 'utf8')
)
const version = npmAppPackageJson.version

// Read the backend package.json
const backendPackageJson = JSON.parse(
  fs.readFileSync(backendPackageJsonPath, 'utf8')
)

// Update the version in the backend package.json
backendPackageJson.version = version

// Write the updated backend package.json
fs.writeFileSync(
  backendPackageJsonPath,
  JSON.stringify(backendPackageJson, null, 2) + '\n'
)

console.log(`Updated backend/package.json to version ${version}`)
