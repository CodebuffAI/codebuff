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
  // Use fetch (this is a Bun script) so the token rides in a header instead of
  // being interpolated into a shell command string — no leak via `ps`, and no
  // breakage/injection if the token ever contains shell metacharacters.
  const res = await fetch(
    `https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github.v3+json',
        Authorization: `token ${token}`,
        'Content-Type': 'application/json',
        // GitHub's API rejects requests without a User-Agent.
        'User-Agent': 'freebuff-desktop-release',
      },
      body: JSON.stringify({ ref: 'main', inputs: { version_type: versionType } }),
    },
  )

  // The dispatch endpoint returns 204 No Content on success; anything else is a failure.
  if (res.status === 204) {
    log('🎉 Desktop release workflow triggered!')
  } else {
    const detail = await res.text().catch(() => '')
    log(`⚠️  Workflow dispatch may have failed (HTTP ${res.status}): ${detail}`)
    log(
      `Trigger it manually at: https://github.com/${REPO}/actions/workflows/${WORKFLOW}`,
    )
  }
} catch (err: any) {
  log(`⚠️  Failed to trigger workflow automatically: ${err?.message ?? err}`)
  log(`Trigger it manually at: https://github.com/${REPO}/actions/workflows/${WORKFLOW}`)
}

log('')
log(`Monitor progress at: https://github.com/${REPO}/actions`)
