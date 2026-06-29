#!/usr/bin/env bun

/**
 * Trigger the Freebuff Desktop release workflow on GitHub Actions.
 *
 *   CODEBUFF_GITHUB_TOKEN=... bun run release [patch|minor|major]
 *
 * Mirrors cli/scripts/release.ts — it just dispatches the
 * freebuff-desktop-release.yml workflow, which does the actual
 * version bump, cross-platform electron-builder packaging, and
 * GitHub Release upload.
 */

import { execSync } from 'node:child_process'

const REPO = 'CodebuffAI/freebuff-private'
const WORKFLOW = 'freebuff-desktop-release.yml'

const versionType = process.argv[2] || 'patch' // patch | minor | major

function log(message: string) {
  console.log(message)
}

function fail(message: string): never {
  console.error(`❌ ${message}`)
  process.exit(1)
}

const token = process.env.CODEBUFF_GITHUB_TOKEN
if (!token) {
  fail(
    'CODEBUFF_GITHUB_TOKEN is required but not set.\n' +
      'Set it to a GitHub PAT with workflow scope (or use the infisical setup).',
  )
}

if (!['patch', 'minor', 'major'].includes(versionType)) {
  fail(`Invalid version type "${versionType}". Use patch | minor | major.`)
}

log('🚀 Initiating Freebuff Desktop release...')
log(`Version bump type: ${versionType}`)

try {
  const cmd = `curl -s -w "\\nHTTP %{http_code}" -X POST \
    -H "Accept: application/vnd.github.v3+json" \
    -H "Authorization: token ${token}" \
    -H "Content-Type: application/json" \
    https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches \
    -d '{"ref":"main","inputs":{"version_type":"${versionType}"}}'`

  const response = execSync(cmd, { encoding: 'utf8' })

  // The dispatch endpoint returns 204 No Content on success; anything else is a failure.
  if (!response.includes('HTTP 204')) {
    log(`⚠️  Workflow dispatch may have failed: ${response}`)
    log(
      `Trigger it manually at: https://github.com/${REPO}/actions/workflows/${WORKFLOW}`,
    )
  } else {
    log('🎉 Desktop release workflow triggered!')
  }
} catch (err: any) {
  log(`⚠️  Failed to trigger workflow automatically: ${err?.message ?? err}`)
  log(`Trigger it manually at: https://github.com/${REPO}/actions/workflows/${WORKFLOW}`)
}

log('')
log(`Monitor progress at: https://github.com/${REPO}/actions`)
