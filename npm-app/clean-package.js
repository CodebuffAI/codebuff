const fs = require('fs')
const path = require('path')
process.env.NEXT_PUBLIC_CB_ENVIRONMENT = 'production'
const loadedEnv = await require('./loadEnv.js')

const packageJsonPath = path.join(__dirname, 'package.json')
const tempPackageJsonPath = path.join(__dirname, 'temp.package.json')
const indexJsPath = path.join(__dirname, 'dist', 'index.js')

const packageJson = require(packageJsonPath)

// Save the current package.json to temp.package.json
fs.writeFileSync(
  tempPackageJsonPath,
  JSON.stringify(packageJson, null, 2) + '\n'
)

delete packageJson.devDependencies
delete packageJson.peerDependencies

// Write the cleaned package.json
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2))

// Add NEXT_PUBLIC_CB_ENVIRONMENT setting to index.js
if (fs.existsSync(indexJsPath)) {
  let indexJsContent = fs.readFileSync(indexJsPath, 'utf8')

  // const envLine = "process.env.NEXT_PUBLIC_CB_ENVIRONMENT = 'production';"
  const lines = indexJsContent.split('\n')
  lines.splice(
    1,
    0,
    ...Object.entries(loadedEnv).map(
      ([key, value]) => `process.env.${key} = '${value}';`
    )
  ) // Insert after the shebang line
  indexJsContent = lines.join('\n')
  fs.writeFileSync(indexJsPath, indexJsContent)
  console.log('NEXT_PUBLIC_CB_ENVIRONMENT setting added to index.js')
} else {
  console.error('index.js not found in the dist directory')
}

console.log(
  'package.json has been cleaned for publishing and index.js has been updated.'
)
