const { execFileSync } = require('node:child_process')

/**
 * electron-builder `afterAllArtifactBuild` hook: notarize + staple the macOS
 * `.dmg` container.
 *
 * electron-builder already notarizes and staples the `.app` inside the dmg
 * (via `mac.notarize`), which is what actually gates launch — a downloaded app
 * relaunches cleanly offline because it carries its own stapled ticket. The dmg
 * *container* is not covered by that, so this hook submits each dmg to Apple's
 * notary and staples the returned ticket, so the disk image also validates
 * fully offline on first mount.
 *
 * Only runs on macOS when real signing is configured (FREEBUFF_NOTARIZE=true,
 * set by the release workflow's "Configure macOS signing" step alongside the
 * APPLE_API_* env). No-ops otherwise, so unsigned/ad-hoc local builds are
 * unaffected. This is a SECOND notary round-trip per dmg on top of the app's,
 * so it adds latency; `--timeout` makes it fail rather than hang indefinitely
 * if Apple's notary service stalls (it can sit in "In Progress" for a long time
 * even when the status dashboard is green).
 */
exports.default = async function afterAllArtifactBuild(buildResult) {
  if (process.platform !== 'darwin') return []
  if (process.env.FREEBUFF_NOTARIZE !== 'true') return []

  const keyPath = process.env.APPLE_API_KEY
  const keyId = process.env.APPLE_API_KEY_ID
  const issuer = process.env.APPLE_API_ISSUER
  if (!keyPath || !keyId || !issuer) {
    console.log('[staple-dmg] APPLE_API_* not fully set — skipping dmg stapling')
    return []
  }

  const dmgs = (buildResult.artifactPaths || []).filter((p) => p.endsWith('.dmg'))
  for (const dmg of dmgs) {
    console.log(`[staple-dmg] notarizing ${dmg}`)
    execFileSync(
      'xcrun',
      [
        'notarytool', 'submit', dmg,
        '--key', keyPath,
        '--key-id', keyId,
        '--issuer', issuer,
        '--wait',
        '--timeout', '45m',
      ],
      { stdio: 'inherit' },
    )
    execFileSync('xcrun', ['stapler', 'staple', dmg], { stdio: 'inherit' })
    console.log(`[staple-dmg] stapled ${dmg}`)
  }

  // We staple in place; no additional artifacts to publish.
  return []
}
