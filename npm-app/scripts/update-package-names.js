#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

// Parse command line arguments
const args = process.argv.slice(2)
const targetPackageName = args[0]

function log(message) {
  console.log(`🔄 ${message}`)
}

function error(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function validatePackageName(name) {
  if (!name) {
    error('Package name is required. Usage: bun run scripts/update-package-names.js <package-name>')
  }
  if (name !== 'codebuff' && name !== 'codecane') {
    error(`Invalid package name: ${name}. Must be either 'codebuff' or 'codecane'`)
  }
}

function updatePackageJson(filePath, targetName) {
  if (!fs.existsSync(filePath)) {
    log(`Skipping ${filePath} (doesn't exist)`)
    return
  }

  const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8'))
  let changed = false

  // Update name field - directly set to target name
  if (pkg.name) {
    const newName = targetName
    if (newName !== pkg.name) {
      log(`${filePath}: ${pkg.name} → ${newName}`)
      pkg.name = newName
      changed = true
    }
  }

  // Update bin field - directly set to target name
  if (pkg.bin) {
    if (typeof pkg.bin === 'string') {
      const newBin = targetName
      if (newBin !== pkg.bin) {
        pkg.bin = newBin
        changed = true
      }
    } else if (typeof pkg.bin === 'object') {
      const newBin = {}
      for (const [key, value] of Object.entries(pkg.bin)) {
        const newKey = targetName
        newBin[newKey] = value
        if (newKey !== key) {
          changed = true
        }
      }
      pkg.bin = newBin
    }
  }

  // Update optionalDependencies field - set platform packages to target name
  if (pkg.optionalDependencies) {
    const newOptionalDeps = {}
    for (const [dep, version] of Object.entries(pkg.optionalDependencies)) {
      // For platform packages, replace codebuff/codecane with target name
      const newDep = dep.replace(/codebuff|codecane/g, targetName)
      newOptionalDeps[newDep] = version
      if (newDep !== dep) {
        changed = true
      }
    }
    pkg.optionalDependencies = newOptionalDeps
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(pkg, null, 2) + '\n')
    log(`Updated ${filePath}`)
  }
}

function main() {
  validatePackageName(targetPackageName)
  
  log(`Setting package names to: ${targetPackageName}`)

  // Only look in the actual codebuff directories (keep directory names as codebuff)
  const packageFiles = [
    'packages/codebuff/package.json',
    'packages/codebuff-linux-x64/package.json',
    'packages/codebuff-linux-arm64/package.json',
    'packages/codebuff-darwin-x64/package.json',
    'packages/codebuff-darwin-arm64/package.json',
    'packages/codebuff-win32-x64/package.json',
    'package.release.json'
  ]

  for (const file of packageFiles) {
    const filePath = path.join(__dirname, '..', file)
    updatePackageJson(filePath, targetPackageName)
  }

  log(`✅ Package names set to ${targetPackageName}!`)
  log('Note: Directory names remain as codebuff-*, only package names and bin commands are changed')
}

main()
