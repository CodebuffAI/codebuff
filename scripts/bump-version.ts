import fs from 'fs'
import path from 'path'

function incrementVersion(filePath: string): void {
  const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const [major, minor, patch] = packageJson.version.split('.').map(Number)
  packageJson.version = `${major}.${minor}.${patch + 1}`
  fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n')
  console.log(`Updated ${filePath} to version ${packageJson.version}`)
}

const npmAppPath = path.join(__dirname, '..', 'npm-app', 'package.json')
const backendPath = path.join(__dirname, '..', 'backend', 'package.json')

incrementVersion(npmAppPath)
incrementVersion(backendPath)
