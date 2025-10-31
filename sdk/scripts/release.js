#!/usr/bin/env node

const { execSync } = require('child_process')

// Parse command line arguments
const args = process.argv.slice(2)
const versionType = args[0] || 'patch' // patch, minor, major, or specific version like 1.2.3

function log(message) {
  console.log(`${message}`)
}

function error(message) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function formatTimestamp() {
  const now = new Date()
  const options = {
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    timeZoneName: 'short',
  }
  return now.toLocaleDateString('en-US', options)
}

function checkGitHubToken() {
  const token = process.env.CODEBUFF_GITHUB_TOKEN
  if (!token) {
    error(
      'CODEBUFF_GITHUB_TOKEN environment variable is required but not set.\n' +
      'Please set it with your GitHub personal access token or use the infisical setup.'
    )
  }
  
  // Set GITHUB_TOKEN for compatibility with existing curl commands
  process.env.GITHUB_TOKEN = token
  return token
}

async function triggerWorkflow(versionType) {
  if (!process.env.GITHUB_TOKEN) {
    error('GITHUB_TOKEN environment variable is required but not set')
  }

  try {
    // Use workflow filename instead of ID
    const triggerCmd = `curl -s -w "HTTP Status: %{http_code}" -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
      -H "Content-Type: application/json" \
      https://api.github.com/repos/CodebuffAI/codebuff/actions/workflows/sdk-release.yml/dispatches \
      -d '{"ref":"main","inputs":{"version_type":"${versionType}"}}'`

    const response = execSync(triggerCmd, { encoding: 'utf8' })

    // Check if response contains error message
    if (response.includes('workflow_dispatch')) {
      log(`⚠️  Workflow dispatch failed: ${response}`)
      log('The workflow may need to be updated on GitHub. Continuing anyway...')
      log(
        'Please manually trigger the workflow at: https://github.com/CodebuffAI/codebuff/actions/workflows/sdk-release.yml',
      )
    } else {
      log('🎉 SDK release workflow triggered!')
    }
  } catch (err) {
    log(`⚠️  Failed to trigger workflow automatically: ${err.message}`)
    log(
      'You may need to trigger it manually at: https://github.com/CodebuffAI/codebuff/actions/workflows/sdk-release.yml',
    )
  }
}

async function main() {
  log('🚀 Initiating SDK release...')
  log(`Date: ${formatTimestamp()}`)

  // Check for local GitHub token
  checkGitHubToken()
  log('✅ Using local CODEBUFF_GITHUB_TOKEN')

  log(`Version bump type: ${versionType}`)

  // Trigger the workflow
  await triggerWorkflow(versionType)

  log('')
  log('Monitor progress at: https://github.com/CodebuffAI/codebuff/actions')
}

main().catch((err) => {
  error(`SDK release failed: ${err.message}`)
})
