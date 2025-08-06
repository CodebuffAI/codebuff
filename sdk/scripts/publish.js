#!/usr/bin/env node

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

function log(message) {
  console.log(`📦 ${message}`)
}

function run(command, options = {}) {
  log(`Running: ${command}`)
  try {
    return execSync(command, { stdio: 'inherit', ...options })
  } catch (error) {
    console.error(`❌ Command failed: ${command}`)
    process.exit(1)
  }
}

function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  
  log('Starting SDK publishing process...')
  
  // Clean and build
  log('Cleaning previous build...')
  run('bun run clean')
  
  log('Building TypeScript...')
  run('bun run build')
  
  // Prepare package.json for publishing
  log('Preparing package.json for publishing...')
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'))
  
  // No workspace dependencies to handle anymore
  
  // Update paths for publishing from dist directory
  packageJson.main = './sdk/src/index.js'
  packageJson.types = './sdk/src/index.d.ts'
  packageJson.exports = {
    '.': {
      types: './sdk/src/index.d.ts',
      import: './sdk/src/index.js',
      default: './sdk/src/index.js'
    }
  }
  
  // Update files field to include all built files
  packageJson.files = [
    'sdk/',
    'common/',
    'README.md',
    'CHANGELOG.md'
  ]
  
  // Write the modified package.json to dist
  fs.writeFileSync('dist/package.json', JSON.stringify(packageJson, null, 2))
  
  // Copy other files
  log('Copying additional files...')
  const filesToCopy = ['README.md', 'CHANGELOG.md']
  
  for (const file of filesToCopy) {
    if (fs.existsSync(file)) {
      fs.copyFileSync(file, `dist/${file}`)
      log(`Copied ${file}`)
    }
  }
  
  // Verify the package
  log('Verifying package contents...')
  run('npm pack --dry-run', { cwd: 'dist' })
  
  if (isDryRun) {
    log('Dry run complete! Package is ready for publishing.')
    log('To publish for real, run: bun run publish-sdk')
    return
  }
  
  // Publish
  log('Publishing to npm...')
  const publishCommand = 'npm publish'
  run(publishCommand, { cwd: 'dist' })
  log('✅ SDK published successfully!')
  log(`📦 Package: ${packageJson.name}@${packageJson.version}`)
}
  
if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}

