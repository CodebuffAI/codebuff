/**
 * Brand the *dev* Electron bundle so `bun run dev` / `bun run app` show
 * "Freebuff" (not "Electron") with our icon in the macOS Dock and Cmd+Tab
 * switcher.
 *
 * Why this is needed: in dev we run `electron .`, so the running .app bundle is
 * Electron's own (node_modules/electron/dist/Electron.app). macOS reads the
 * Cmd+Tab name from that bundle's CFBundleName — and there is NO Electron
 * runtime API to override it (app.setName() only changes the menu bar / About
 * panel / userData path, not the switcher). The packaged app is already correct
 * (electron-builder writes productName "Freebuff" into Info.plist), so this is a
 * dev-only cosmetic fix.
 *
 * The runtime icon is handled separately by app.dock.setIcon() in
 * electron/main.cjs; we also drop our icns into the bundle here so the icon is
 * right even before that fires and so LaunchServices caches the right one.
 *
 * macOS-only and fully idempotent — safe to run on every dev launch. Best-effort:
 * any failure (non-macOS host, bundle not found, no write permission) is logged
 * and ignored so it can never block the app from starting.
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'

const APP_NAME = 'Freebuff'

export function brandDevElectron(): void {
  if (process.platform !== 'darwin') return

  // Resolve the Electron bundle the dev launcher will actually run. The
  // `electron` package's main export is the path to its binary inside the
  // bundle: .../Electron.app/Contents/MacOS/Electron.
  let appBundle: string
  try {
    const require = createRequire(import.meta.url)
    const electronBin = require('electron') as string
    // .../Electron.app/Contents/MacOS/Electron → .../Electron.app
    appBundle = resolve(dirname(electronBin), '..', '..')
  } catch (err) {
    console.warn(`[brand-dev-electron] could not resolve electron bundle: ${String(err)}`)
    return
  }

  const plist = resolve(appBundle, 'Contents', 'Info.plist')
  if (!appBundle.endsWith('.app') || !existsSync(plist)) {
    console.warn(`[brand-dev-electron] not an Electron .app bundle: ${appBundle}`)
    return
  }

  // PlistBuddy `Set` is idempotent (these keys already exist in Electron's plist).
  const setKey = (key: string, value: string) =>
    spawnSync('/usr/libexec/PlistBuddy', ['-c', `Set :${key} ${value}`, plist], {
      stdio: 'ignore',
    })

  const before = spawnSync(
    '/usr/libexec/PlistBuddy',
    ['-c', 'Print :CFBundleName', plist],
    { encoding: 'utf8' },
  ).stdout?.trim()

  setKey('CFBundleName', APP_NAME)
  setKey('CFBundleDisplayName', APP_NAME)

  // Replace the bundle icon with ours (CFBundleIconFile is "electron" → electron.icns).
  const ourIcns = resolve(import.meta.dir, '..', 'build', 'icon.icns')
  const bundleIcns = resolve(appBundle, 'Contents', 'Resources', 'electron.icns')
  if (existsSync(ourIcns)) {
    try {
      copyFileSync(ourIcns, bundleIcns)
    } catch (err) {
      console.warn(`[brand-dev-electron] could not copy icon: ${String(err)}`)
    }
  }

  // Editing Info.plist (and swapping the icns) breaks the bundle's ad-hoc code
  // signature — the outer seal hashes both. With a broken seal, macOS keeps
  // showing the OLD name in the Cmd+Tab switcher/Dock no matter what the plist
  // says, so re-sign ad-hoc whenever verification fails. Cheap (<1s) and only
  // runs when something actually changed.
  const sealBroken =
    spawnSync('codesign', ['--verify', appBundle], { stdio: 'ignore' }).status !== 0
  if (sealBroken) {
    spawnSync('codesign', ['--force', '--sign', '-', appBundle], { stdio: 'ignore' })
  }

  if (before !== APP_NAME || sealBroken) {
    // Nudge LaunchServices to drop its cached registration for the bundle —
    // a plain `touch` is not reliable for the Cmd+Tab name on modern macOS.
    spawnSync(
      '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
      ['-f', appBundle],
      { stdio: 'ignore' },
    )
    spawnSync('touch', [appBundle], { stdio: 'ignore' })
    console.log(`[brand-dev-electron] branded dev Electron bundle as "${APP_NAME}".`)
  }
}

// Allow running standalone: `bun scripts/brand-dev-electron.ts`.
if (import.meta.main) brandDevElectron()
