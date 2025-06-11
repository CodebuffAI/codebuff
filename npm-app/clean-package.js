const fs = require('fs')
const path = require('path')

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
        } else {
          packageJson[depType][pkgName] = '1.0.0'
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

  // Dynamically get client-side environment variables from env.ts
  const envTsContent = fs.readFileSync(
    path.join(__dirname, '..', 'env.ts'),
    'utf8'
  )
  const clientKeysMatch = envTsContent.match(/client: {([^]*?)}/s)
  let clientKeys = []
  if (clientKeysMatch) {
    clientKeys =
      clientKeysMatch[1]
        .split('\n')
        .map((line) => line.match(/^\s*(\w+):/))
        .filter(Boolean)
        .map((match) => match[1]) ?? []
  }

  // Get all environment variables that start with NEXT_PUBLIC_ or are needed for the npm package
  const envVarsToInject = Object.entries(process.env)
    .filter(([key, value]) => clientKeys.includes(key) && value !== undefined)
    .map(([key, value]) => `process.env.${key} = '${value}';`)

  const lines = indexJsContent.split('\n')
  // Insert all environment variables after the shebang line
  lines.splice(1, 0, ...envVarsToInject)
  indexJsContent = lines.join('\n')
  fs.writeFileSync(indexJsPath, indexJsContent)
  console.log(
    `Injected ${envVarsToInject.length} environment variables into index.js:`
  )
  envVarsToInject.forEach((envVar) => console.log(`- ${envVar}`))
} else {
  console.error('index.js not found in the dist directory')
}
