#!/usr/bin/env node

const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

// Parse command line arguments
const args = process.argv.slice(2)
const versionType = args[0] || 'patch' // patch, minor, major, or specific version like 1.2.3

function log(message) {
  console.log(`🚀 ${message}`)
}

function error(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function run(command, options = {}) {
  log(`Running: ${command}`)
  try {
    return execSync(command, { 
      stdio: 'inherit', 
      encoding: 'utf8',
      ...options 
    })
  } catch (err) {
    error(`Command failed: ${command}`)
  }
}

function getCurrentVersion() {
  const packagePath = path.join(__dirname, '..', 'package.release.json')
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  return pkg.version
}

function bumpVersion(currentVersion, type) {
  // If type looks like a version number (x.y.z), use it directly
  if (/^\d+\.\d+\.\d+$/.test(type)) {
    return type
  }

  const [major, minor, patch] = currentVersion.split('.').map(Number)
  
  switch (type) {
    case 'major':
      return `${major + 1}.0.0`
    case 'minor':
      return `${major}.${minor + 1}.0`
    case 'patch':
    default:
      return `${major}.${minor}.${patch + 1}`
  }
}

function updatePackageVersion(newVersion) {
  const packagePath = path.join(__dirname, '..', 'package.release.json')
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'))
  pkg.version = newVersion
  fs.writeFileSync(packagePath, JSON.stringify(pkg, null, 2) + '\n')
  log(`Updated package.release.json to version ${newVersion}`)
}

function checkWorkingDirectory() {
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    if (status.trim()) {
      error('Working directory is not clean. Please commit or stash your changes first.')
    }
  } catch (err) {
    error('Failed to check git status')
  }
}

function checkGitBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
    if (branch !== 'main') {
      const proceed = process.env.FORCE_RELEASE === 'true'
      if (!proceed) {
        error(`You are on branch '${branch}', not 'main'. Set FORCE_RELEASE=true to proceed anyway.`)
      }
    }
  } catch (err) {
    error('Failed to check current git branch')
  }
}

async function waitForGitHubRelease(version) {
  log('Waiting for GitHub Actions to build and create release...')
  log('You can monitor the progress at: https://github.com/CodebuffAI/codebuff/actions')
  
  // Wait a bit for the workflow to start
  await new Promise(resolve => setTimeout(resolve, 10000))
  
  log('Checking if GitHub release is ready...')
  let attempts = 0
  const maxAttempts = 120 // 10 minutes max
  
  while (attempts < maxAttempts) {
    try {
      // Check if the release exists
      execSync(`curl -s -f -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/CodebuffAI/codebuff/releases/tags/v${version}`, { stdio: 'pipe' })
      log('✅ GitHub release is ready!')
      return true
    } catch (err) {
      attempts++
      if (attempts % 6 === 0) { // Log every 30 seconds
        log(`Still waiting for GitHub release... (${attempts}/10 minutes)`)
      }
      await new Promise(resolve => setTimeout(resolve, 5000)) // Wait 5 seconds
    }
  }
  
  error('Timeout waiting for GitHub release. Please check the GitHub Actions workflow.')
}

async function main() {
  log('Starting release process...')
  
  // Pre-flight checks
  checkWorkingDirectory()
  checkGitBranch()
  
  // Get current version and calculate new version
  const currentVersion = getCurrentVersion()
  const newVersion = bumpVersion(currentVersion, versionType)
  
  log(`Current version: ${currentVersion}`)
  log(`New version: ${newVersion}`)
  
  // Confirm with user
  if (process.env.CI !== 'true') {
    log('Press Ctrl+C to cancel, or Enter to continue...')
    process.stdin.setRawMode(true)
    process.stdin.resume()
    await new Promise(resolve => {
      process.stdin.once('data', () => {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        resolve()
      })
    })
  }
  
  // Update version in package.release.json
  updatePackageVersion(newVersion)
  
  // Commit the version change
  run('git add package.release.json')
  run(`git commit -m "Bump version to ${newVersion}"`)
  
  // Create and push tag
  run(`git tag -a v${newVersion} -m "Release version ${newVersion}"`)
  run('git push origin main')
  run(`git push origin v${newVersion}`)
  
  log('✅ Tag pushed! GitHub Actions will now build the binaries.')
  
  // Wait for GitHub release to be ready
  await waitForGitHubRelease(newVersion)
  
  // Publish to npm
  log('Publishing to npm...')
  run('npm publish package.release.json')
  
  log('🎉 Release complete!')
  log(`Version ${newVersion} has been:`)
  log('  ✅ Tagged and pushed to GitHub')
  log('  ✅ Built as binaries via GitHub Actions')
  log('  ✅ Published to npm')
  log('')
  log(`Users can now install with: npm install -g codebuff@${newVersion}`)
}

main().catch(err => {
  error(`Release failed: ${err.message}`)
})
