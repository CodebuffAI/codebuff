const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

/**
 * electron-builder `afterPack` hook: ad-hoc code-sign the macOS app bundle.
 *
 * We ship without an Apple Developer cert, and `mac.identity: null` leaves the
 * app with only the linker's stub signature — no sealed `_CodeSignature`, so
 * `codesign --verify` fails and macOS reports a *downloaded* copy as
 * "damaged" (a dead-end dialog offering only "Move to Trash"). A proper ad-hoc
 * signature (`codesign --sign -`) seals the whole bundle, which downgrades that
 * to the standard "Apple cannot verify the developer" prompt that users can get
 * past via right-click → Open / Open Anyway.
 *
 * This is an interim measure. Real Developer ID signing + notarization is the
 * follow-up that removes the prompt entirely; wiring that in should replace
 * this hook (or make it a no-op when a real identity is configured).
 *
 * Runs on the packed `.app` before the dmg is built, so the installer ships the
 * signed bundle. No-ops on non-macOS runners.
 */
exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return

  // When a real Developer ID identity is configured (CI exports CSC_LINK after
  // decoding the .p12 secret), electron-builder does its own hardened-runtime
  // signing + notarization after this hook. Skip the ad-hoc pass so we don't
  // seal an ad-hoc signature that real signing would just have to redo.
  if (process.env.CSC_LINK || process.env.FREEBUFF_NOTARIZE === 'true') {
    console.log('[ad-hoc-sign] Developer ID signing configured — skipping ad-hoc sign')
    return
  }

  // Find the packed bundle by scanning the output dir rather than relying on a
  // specific appInfo field, so a rename of productName can't silently break it.
  const bundle = fs
    .readdirSync(context.appOutDir)
    .find((entry) => entry.endsWith('.app'))
  if (!bundle) {
    throw new Error(`[ad-hoc-sign] no .app bundle found in ${context.appOutDir}`)
  }
  const appPath = path.join(context.appOutDir, bundle)

  // `--deep` is needed so the nested Electron frameworks/helpers are signed too;
  // `--sign -` is the ad-hoc identity.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  })
  console.log(`[ad-hoc-sign] ad-hoc signed ${appPath}`)
}
