const fs = require('fs')
const path = require('path')

// Set production environment for the build
process.env.NEXT_PUBLIC_CB_ENVIRONMENT = 'prod'

const packageJsonPath = path.join(__dirname, 'package.json')
const tempPackageJsonPath = path.join(__dirname, 'temp.package.json')
const indexJsPath = path.join(__dirname, 'dist', 'index.js')

const packageJson = require(packageJsonPath)

// Save the current package.json to temp.package.json
fs.writeFileSync(
  tempPackageJsonPath,
  JSON.stringify(packageJson, null, 2) + '\n'
)

for (const depType of ['dependencies', 'optionalDependencies']) {
  if (packageJson[depType]) {
    for (const [pkgName, version] of Object.entries(packageJson[depType])) {
      if (typeof version === 'string' && version.startsWith('workspace:')) {
        if (pkgName === 'common') {
          delete packageJson[depType][pkgName]
          console.log(
            `Removed dependency on ${pkgName} because it's now bundled.`
          )
        } else {
          packageJson[depType][pkgName] = '1.0.0'
          console.warn(`No version found for ${pkgName}, defaulting to 1.0.0`)
        }
      }
    }
  }
}

delete packageJson.devDependencies
delete packageJson.peerDependencies

// Write the cleaned package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

// Inject all environment variables into index.js
if (fs.existsSync(indexJsPath)) {
  let indexJsContent = fs.readFileSync(indexJsPath, 'utf8')

  // Get all environment variables that start with NEXT_PUBLIC_ or are needed for the npm package
  const envVarsToInject = Object.entries(process.env)
    .filter(
      ([key, value]) => key.startsWith('NEXT_PUBLIC_') && value !== undefined
    )
    .map(([key, value]) => `process.env.${key} = '${value}';`)

  const lines = indexJsContent.split('\n')
  // Insert all environment variables after the shebang line
  lines.splice(1, 0, ...envVarsToInject)
  indexJsContent = lines.join('\n')
  fs.writeFileSync(indexJsPath, indexJsContent)
  console.log(
    `Injected ${envVarsToInject.length} environment variables into index.js`
  )
} else {
  console.error('index.js not found in the dist directory')
}

console.log(
  'package.json has been cleaned for publishing and index.js has been updated.'
)
