import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'

function incrementVersion(filePath: string): void {
  const packageJson = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  const [major, minor, patch] = packageJson.version.split('.').map(Number)
  packageJson.version = `${major}.${minor}.${patch + 1}`
  fs.writeFileSync(filePath, JSON.stringify(packageJson, null, 2) + '\n')
  console.log(`Updated ${filePath} to version ${packageJson.version}`)
}

const npmAppPath = path.join(__dirname, '..', 'npm-app', 'package.json')
incrementVersion(npmAppPath)

// Commit the changes
const commitMessage = `Bump version to ${JSON.parse(fs.readFileSync(npmAppPath, 'utf8')).version}`
execSync(`git add ${npmAppPath}`)
execSync(`git commit -m "${commitMessage}"`)
console.log('Changes committed successfully')
