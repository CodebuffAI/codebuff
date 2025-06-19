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
      ...options,
    })
  } catch (err) {
    throw new Error(`Command failed: ${command} - ${err.message}`)
  }
}

function generateGitHubToken() {
  log('🔑 Generating GitHub App access token...')

  try {
    // Run the generate-github-token script and capture its output
    const output = execSync('bun run scripts/generate-github-token.ts', {
      encoding: 'utf8',
      stdio: 'pipe', // Capture output instead of inheriting
    })

    // Extract the token from the export command in the output
    const exportMatch = output.match(/export GITHUB_TOKEN="([^"]+)"/)
    if (exportMatch && exportMatch[1]) {
      const token = exportMatch[1]
      process.env.GITHUB_TOKEN = token
      log('✅ GitHub token generated and set successfully!')
      return token
    } else {
      error(
        'Failed to extract GitHub token from generate-github-token script output'
      )
    }
  } catch (err) {
    error(`Failed to generate GitHub token: ${err.message}`)
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
      error(
        'Working directory is not clean. Please commit or stash your changes first.'
      )
    }
  } catch (err) {
    error('Failed to check git status')
  }
}

function checkGitBranch() {
  try {
    const branch = execSync('git rev-parse --abbrev-ref HEAD', {
      encoding: 'utf8',
    }).trim()
    if (branch !== 'main') {
      const proceed = process.env.FORCE_RELEASE === 'true'
      if (!proceed) {
        error(
          `You are on branch '${branch}', not 'main'. Set FORCE_RELEASE=true to proceed anyway.`
        )
      }
    }
  } catch (err) {
    error('Failed to check current git branch')
  }
}

async function waitForGitHubRelease(version) {
  log('Waiting for GitHub Actions to build and create release...')
  log(
    'You can monitor the progress at: https://github.com/CodebuffAI/codebuff/actions'
  )

  // Wait a bit for the workflow to start
  await new Promise((resolve) => setTimeout(resolve, 10000))

  log('Checking if GitHub release is ready...')
  let attempts = 0
  const maxAttempts = 60 // 10 minutes max

  while (attempts < maxAttempts) {
    try {
      // Check if the release exists
      execSync(
        `curl -s -f -H "Accept: application/vnd.github.v3+json" https://api.github.com/repos/CodebuffAI/codebuff-community/releases/tags/v${version}`,
        { stdio: 'pipe' }
      )
      log('✅ GitHub release is ready!')
      return true
    } catch (err) {
      attempts++
      if (attempts % 6 === 0) {
        // Log every 60 seconds
        log(`Still waiting for GitHub release... (${attempts / 6}/10 minutes)`)
      }
      await new Promise((resolve) => setTimeout(resolve, 10000)) // Wait 10 seconds
    }
  }

  error(
    'Timeout waiting for GitHub release. Please check the GitHub Actions workflow.'
  )
}

async function triggerWorkflow(version) {
  log('Triggering GitHub Actions workflow...')

  if (!process.env.GITHUB_TOKEN) {
    error('GITHUB_TOKEN environment variable is required but not set')
  }

  try {
    // Use workflow ID instead of filename to avoid caching issues
    const triggerCmd = `curl -s -w "HTTP Status: %{http_code}" -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
      -H "Content-Type: application/json" \
      https://api.github.com/repos/CodebuffAI/codebuff/actions/workflows/168942713/dispatches \
      -d '{"ref":"main","inputs":{"tag":"v${version}"}}'`

    const response = execSync(triggerCmd, { encoding: 'utf8' })

    // Check if response contains error message
    if (response.includes('workflow_dispatch')) {
      log(`⚠️  Workflow dispatch failed: ${response}`)
      log('The workflow may need to be updated on GitHub. Continuing anyway...')
      log(
        'Please manually trigger the workflow at: https://github.com/CodebuffAI/codebuff/actions/workflows/release-binaries.yml'
      )
    } else {
      log(
        `Workflow trigger response: ${response || '(empty response - likely success)'}`
      )
      log('✅ Workflow triggered successfully!')
    }
  } catch (err) {
    log(`⚠️  Failed to trigger workflow automatically: ${err.message}`)
    log(
      'You may need to trigger it manually at: https://github.com/CodebuffAI/codebuff/actions/workflows/release-binaries.yml'
    )
  }
}

async function createTagInCommunityRepo(version) {
  log('Creating tag in codebuff-community repository...')

  // Check if GITHUB_TOKEN is available
  if (!process.env.GITHUB_TOKEN) {
    error('GITHUB_TOKEN environment variable is required but not set')
  }

  try {
    // Get the latest commit SHA from the community repo
    log('Getting latest commit from codebuff-community...')
    const getCommitCmd = `curl -s -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
      https://api.github.com/repos/CodebuffAI/codebuff-community/commits/main`

    const commitResponse = execSync(getCommitCmd, { encoding: 'utf8' })
    const commitData = JSON.parse(commitResponse)

    if (!commitData.sha) {
      error(`Failed to get commit SHA. Response: ${commitResponse}`)
    }

    const commitSha = commitData.sha
    log(`Using commit SHA: ${commitSha}`)

    // Create the tag
    log('Creating tag object...')
    const createTagCmd = `curl -s -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
      https://api.github.com/repos/CodebuffAI/codebuff-community/git/tags \
      -d '{"tag":"v${version}","message":"Release version ${version}","object":"${commitSha}","type":"commit"}'`

    const tagResponse = execSync(createTagCmd, { encoding: 'utf8' })
    log(`Tag creation response: ${tagResponse}`)

    // Create the reference
    log('Creating tag reference...')
    const createRefCmd = `curl -s -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
      https://api.github.com/repos/CodebuffAI/codebuff-community/git/refs \
      -d '{"ref":"refs/tags/v${version}","sha":"${commitSha}"}'`

    const refResponse = execSync(createRefCmd, { encoding: 'utf8' })
    log(`Reference creation response: ${refResponse}`)

    log('✅ Tag created successfully in codebuff-community!')
  } catch (err) {
    error(`Failed to create tag in codebuff-community: ${err.message}`)
  }
}

async function main() {
  log('Starting release process...')

  // Generate GitHub token first
  generateGitHubToken()

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
    await new Promise((resolve) => {
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
  run('git push')

  // Create tag directly in codebuff-community repository
  await createTagInCommunityRepo(newVersion)

  // Trigger the workflow in the private codebuff repo
  await triggerWorkflow(newVersion)

  log(
    '✅ Tag created and workflow triggered! GitHub Actions will now build the binaries.'
  )

  // Wait for GitHub release to be ready
  await waitForGitHubRelease(newVersion)

  // Publish to npm
  log('Publishing to npm...')

  // Temporarily copy package.release.json to package.json for publishing
  const originalPackageJson = fs.readFileSync(
    path.join(__dirname, '..', 'package.json'),
    'utf8'
  )
  const releasePackageJson = fs.readFileSync(
    path.join(__dirname, '..', 'package.release.json'),
    'utf8'
  )

  try {
    // Replace package.json with release version
    fs.writeFileSync(
      path.join(__dirname, '..', 'package.json'),
      releasePackageJson
    )

    // Publish using the standard package.json
    run('npm publish')

    log('🎉 Release complete!')
    log(`Version ${newVersion} has been:`)
    log('  ✅ Tagged and pushed to GitHub')
    log('  ✅ Built as binaries via GitHub Actions')
    log('  ✅ Published to npm')
    log('')
    log(`Users can now install with: npm install -g codebuff@${newVersion}`)
  } finally {
    // Always restore the original package.json
    fs.writeFileSync(
      path.join(__dirname, '..', 'package.json'),
      originalPackageJson
    )
    log('✅ Restored original package.json')
  }
}

main().catch((err) => {
  error(`Release failed: ${err.message}`)
})
