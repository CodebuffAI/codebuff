#!/usr/bin/env node

const { execSync } = require('child_process')

function log(message: string) {
  console.log(`${message}`)
}

function error(message: string) {
  console.error(`❌ ${message}`)
  process.exit(1)
}

function checkGitHubToken() {
  const token = process.env.CODEBUFF_GITHUB_TOKEN
  if (!token) {
    error(
      'CODEBUFF_GITHUB_TOKEN environment variable is required but not set.\n' +
      'Please set it with your GitHub personal access token or use the infisical setup.'
    )
  }
  return token
}

function getCurrentBranch(): string {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'main'
  }
}

async function triggerWorkflow(token: string, branch: string) {
  try {
    const triggerCmd = `curl -s -w "HTTP Status: %{http_code}" -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${token}" \
      -H "Content-Type: application/json" \
      https://api.github.com/repos/CodebuffAI/codebuff/actions/workflows/buffbench.yml/dispatches \
      -d '{"ref":"${branch}"}'`

    const response = execSync(triggerCmd, { encoding: 'utf8' })

    if (response.includes('workflow_dispatch')) {
      log(`⚠️  Workflow dispatch failed: ${response}`)
      log(
        'Please manually trigger the workflow at: https://github.com/CodebuffAI/codebuff/actions/workflows/buffbench.yml',
      )
    } else {
      log('🎉 BuffBench workflow triggered!')
    }
  } catch (err: any) {
    log(`⚠️  Failed to trigger workflow automatically: ${err.message}`)
    log(
      'You may need to trigger it manually at: https://github.com/CodebuffAI/codebuff/actions/workflows/buffbench.yml',
    )
  }
}

async function main() {
  const branch = process.argv[2] || getCurrentBranch()

  log('🧪 Triggering BuffBench workflow...')
  log(`Branch: ${branch}`)

  const token = checkGitHubToken()
  if (!token) return
  log('✅ Using CODEBUFF_GITHUB_TOKEN')

  await triggerWorkflow(token, branch)

  log('')
  log('Monitor progress at: https://github.com/CodebuffAI/codebuff/actions/workflows/buffbench.yml')
}

main().catch((err) => {
  error(`Failed to trigger BuffBench: ${err.message}`)
})
