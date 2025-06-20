#!/usr/bin/env node

const { execSync } = require('child_process')

// Parse command line arguments
const args = process.argv.slice(2)
const packageName = args[0] || 'codebuff' // codebuff or codecane
const versionType = args[1] || 'patch' // patch, minor, major, or specific version like 1.2.3

function log(message) {
  console.log(`🚀 ${message}`)
}

function error(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
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

async function triggerWorkflow(versionType, packageName) {
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
      -d '{"ref":"main","inputs":{"version_type":"${versionType}","package_name":"${packageName}"}}'`

    const response = execSync(triggerCmd, { encoding: 'utf8' })

    // Check if response contains error message
    if (response.includes('workflow_dispatch')) {
      log(`⚠️  Workflow dispatch failed: ${response}`)
      log('The workflow may need to be updated on GitHub. Continuing anyway...')
      log(
        'Please manually trigger the workflow at: https://github.com/CodebuffAI/codebuff/actions/workflows/publish.yml'
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
      'You may need to trigger it manually at: https://github.com/CodebuffAI/codebuff/actions/workflows/publish.yml'
    )
  }
}

async function main() {
  log('Starting release process...')

  // Generate GitHub token first
  generateGitHubToken()

  // Pre-flight checks
  checkWorkingDirectory()
  checkGitBranch()

  log(`Version bump type: ${versionType}`)
  log(`Package name: ${packageName}`)

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

  // Trigger the workflow
  await triggerWorkflow(versionType, packageName)

  log('🎉 Release workflow triggered!')
  log('The GitHub Actions workflow will now:')
  log('  1. Calculate and update package versions')
  log(`  2. ${packageName === 'codecane' ? 'Toggle package names to codecane' : 'Keep codebuff package names'}`)
  log('  3. Build binaries for all platforms')
  log(`  4. Publish platform-specific npm packages as ${packageName}-*`)
  log(`  5. Publish the main ${packageName} npm package`)
  log('  6. Commit version changes and create git tag')
  log('')
  log('Monitor progress at: https://github.com/CodebuffAI/codebuff/actions')
}

main().catch((err) => {
  error(`Release failed: ${err.message}`)
})
