#!/usr/bin/env bun

/**
 * Freebuff CLI release script.
 *
 * Triggers the freebuff-release.yml GitHub Actions workflow
 * to build, publish, and release the Freebuff CLI to npm.
 *
 * Usage:
 *   bun freebuff/cli/release.ts [patch|minor|major]
 *
 * Requires:
 *   CODEBUFF_GITHUB_TOKEN environment variable
 */

import { execSync } from 'child_process'

const args = process.argv.slice(2)
const versionType = args[0] || 'patch'

function log(message: string) {
  console.log(`${message}`)
}

function error(message: string): never {
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
  } as const
  return now.toLocaleDateString('en-US', options)
}

function checkGitHubToken() {
  const token = process.env.CODEBUFF_GITHUB_TOKEN
  if (!token) {
    error(
      'CODEBUFF_GITHUB_TOKEN environment variable is required but not set.\n' +
        'Please set it with your GitHub personal access token or use the infisical setup.',
    )
  }

  process.env.GITHUB_TOKEN = token
  return token
}

async function triggerWorkflow(versionType: string) {
  if (!process.env.GITHUB_TOKEN) {
    error('GITHUB_TOKEN environment variable is required but not set')
  }

  try {
    const triggerCmd = `curl -s -w "HTTP Status: %{http_code}" -X POST \
      -H "Accept: application/vnd.github.v3+json" \
      -H "Authorization: token ${process.env.GITHUB_TOKEN}" \
      -H "Content-Type: application/json" \
      https://api.github.com/repos/CodebuffAI/codebuff/actions/workflows/freebuff-release.yml/dispatches \
      -d '{"ref":"main","inputs":{"version_type":"${versionType}"}}'`

    const response = execSync(triggerCmd, { encoding: 'utf8' })

    if (response.includes('workflow_dispatch')) {
      log(`⚠️  Workflow dispatch failed: ${response}`)
      log(
        'Please manually trigger the workflow at: https://github.com/CodebuffAI/codebuff/actions/workflows/freebuff-release.yml',
      )
    } else {
      log('🎉 Freebuff release workflow triggered!')
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    log(`⚠️  Failed to trigger workflow automatically: ${message}`)
    log(
      'You may need to trigger it manually at: https://github.com/CodebuffAI/codebuff/actions/workflows/freebuff-release.yml',
    )
  }
}

async function main() {
  log('🚀 Initiating Freebuff release...')
  log(`Date: ${formatTimestamp()}`)

  checkGitHubToken()
  log('✅ Using local CODEBUFF_GITHUB_TOKEN')

  log(`Version bump type: ${versionType}`)

  await triggerWorkflow(versionType)

  log('')
  log(
    'Monitor progress at: https://github.com/CodebuffAI/codebuff/actions/workflows/freebuff-release.yml',
  )
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err)
  error(`Release failed: ${message}`)
})
