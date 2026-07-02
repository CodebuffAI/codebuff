import { describe, expect, test } from 'bun:test'

// The updater is a CommonJS main-process module; only its pure helpers are
// exercised here (no electron dependency is loaded at import time).
// eslint-disable-next-line @typescript-eslint/no-var-requires
const updater = require('./updater.cjs')

describe('compareSemver', () => {
  test('orders by major/minor/patch', () => {
    expect(updater.compareSemver('1.0.0', '1.0.1')).toBe(-1)
    expect(updater.compareSemver('1.2.0', '1.1.9')).toBe(1)
    expect(updater.compareSemver('2.0.0', '1.9.9')).toBe(1)
    expect(updater.compareSemver('0.0.1', '0.0.1')).toBe(0)
  })

  test('unparseable versions sort lowest', () => {
    expect(updater.compareSemver('nope', '0.0.1')).toBe(-1)
    expect(updater.compareSemver('0.0.1', 'nope')).toBe(1)
    expect(updater.compareSemver('nope', 'also-bad')).toBe(0)
  })
})

describe('isNewer', () => {
  test('true only when latest strictly exceeds current', () => {
    expect(updater.isNewer('0.0.1', '0.0.2')).toBe(true)
    expect(updater.isNewer('0.0.2', '0.0.2')).toBe(false)
    expect(updater.isNewer('0.1.0', '0.0.9')).toBe(false)
  })
})

describe('pickLatestVersion', () => {
  const refs = [
    { ref: 'refs/tags/freebuff-desktop-v0.0.1' },
    { ref: 'refs/tags/freebuff-desktop-v0.0.10' },
    { ref: 'refs/tags/freebuff-desktop-v0.0.2' },
    // Noise that must be ignored: CLI releases + a malformed tag.
    { ref: 'refs/tags/v1.0.683' },
    { ref: 'refs/tags/freebuff-desktop-vbanana' },
  ]

  test('returns the highest semver desktop tag (numeric, not lexical)', () => {
    expect(updater.pickLatestVersion(refs)).toBe('0.0.10')
  })

  test('handles empty / missing input', () => {
    expect(updater.pickLatestVersion([])).toBeNull()
    expect(updater.pickLatestVersion(undefined)).toBeNull()
    expect(updater.pickLatestVersion([{ ref: 'refs/tags/other-thing-v1.0.0' }])).toBeNull()
  })
})

describe('pickAssetUrl', () => {
  // Mirrors the live v0.0.1 asset names on CodebuffAI/codebuff-community.
  const url = (name: string) => `https://example.com/${name}`
  const assets = [
    { name: 'Freebuff-0.0.1-linux-x86_64.AppImage', browser_download_url: url('linux.AppImage') },
    { name: 'Freebuff-0.0.1-mac-arm64.dmg', browser_download_url: url('mac-arm64.dmg') },
    { name: 'Freebuff-0.0.1-mac-x64.dmg', browser_download_url: url('mac-x64.dmg') },
    { name: 'Freebuff-0.0.1-win-x64.exe', browser_download_url: url('win.exe') },
  ]

  test('mac picks the exact arch build', () => {
    expect(updater.pickAssetUrl(assets, 'darwin', 'arm64')).toBe(url('mac-arm64.dmg'))
    expect(updater.pickAssetUrl(assets, 'darwin', 'x64')).toBe(url('mac-x64.dmg'))
  })

  test('win / linux resolve by extension (linux arch token is x86_64, not x64)', () => {
    expect(updater.pickAssetUrl(assets, 'win32', 'x64')).toBe(url('win.exe'))
    expect(updater.pickAssetUrl(assets, 'linux', 'x64')).toBe(url('linux.AppImage'))
  })

  test('mac falls back to any dmg when the arch token is absent', () => {
    const onlyIntel = [{ name: 'Freebuff-mac-x64.dmg', browser_download_url: url('only.dmg') }]
    expect(updater.pickAssetUrl(onlyIntel, 'darwin', 'arm64')).toBe(url('only.dmg'))
  })

  test('returns null when nothing matches the platform', () => {
    expect(updater.pickAssetUrl([], 'darwin', 'arm64')).toBeNull()
    expect(updater.pickAssetUrl(assets, 'sunos', 'x64')).toBeNull()
  })
})

describe('macAppBundlePath', () => {
  test('derives the .app root from the executable path', () => {
    expect(
      updater.macAppBundlePath('/Applications/Freebuff.app/Contents/MacOS/Freebuff'),
    ).toBe('/Applications/Freebuff.app')
  })

  test('null when not inside a .app bundle (dev / unpacked)', () => {
    expect(updater.macAppBundlePath('/usr/local/bin/electron')).toBeNull()
  })
})

describe('buildInstallPlan', () => {
  const base = { installerPath: '/tmp/Freebuff-0.0.2.dmg', pid: 4242 }

  test('windows runs the installer directly (it swaps + relaunches)', () => {
    const plan = updater.buildInstallPlan({
      ...base,
      platform: 'win32',
      installerPath: 'C:/Temp/Freebuff-0.0.2-win-x64.exe',
      execPath: 'C:/Program Files/Freebuff/Freebuff.exe',
    })
    expect(plan).toEqual({
      command: 'C:/Temp/Freebuff-0.0.2-win-x64.exe',
      args: [],
      detached: true,
    })
  })

  test('linux replaces $APPIMAGE and re-execs; null without it', () => {
    const plan = updater.buildInstallPlan({
      ...base,
      platform: 'linux',
      installerPath: '/tmp/new.AppImage',
      execPath: '/opt/whatever',
      appImagePath: '/home/u/Apps/Freebuff.AppImage',
    })
    expect(plan.command).toBe('/bin/sh')
    const script = plan.args[1]
    expect(script).toContain('kill -0 4242') // waits for this process to exit
    expect(script).toContain("mv -f '/tmp/new.AppImage' '/home/u/Apps/Freebuff.AppImage'")

    expect(
      updater.buildInstallPlan({
        ...base,
        platform: 'linux',
        installerPath: '/tmp/new.AppImage',
        execPath: '/opt/whatever',
      }),
    ).toBeNull() // no $APPIMAGE → can't self-update
  })

  test('mac mounts and swaps the bundle (no quarantine strip); null off-bundle', () => {
    const plan = updater.buildInstallPlan({
      ...base,
      platform: 'darwin',
      execPath: '/Applications/Freebuff.app/Contents/MacOS/Freebuff',
    })
    expect(plan.command).toBe('/bin/sh')
    const script = plan.args[1]
    expect(script).toContain('hdiutil attach')
    expect(script).toContain("ditto") // stage a full copy before swapping
    // Builds are notarized now, so we no longer strip com.apple.quarantine.
    expect(script).not.toContain('xattr')
    expect(script).toContain("open '/Applications/Freebuff.app'")
    expect(script).toContain('kill -0 4242')

    expect(
      updater.buildInstallPlan({ ...base, platform: 'darwin', execPath: '/usr/bin/electron' }),
    ).toBeNull()
  })

  test('unknown platform → null', () => {
    expect(
      updater.buildInstallPlan({ ...base, platform: 'aix', execPath: '/x' }),
    ).toBeNull()
  })
})

describe('isCompleteDownload', () => {
  test('accepts when the server advertised no length (total 0)', () => {
    expect(updater.isCompleteDownload(0, 0)).toBe(true)
    expect(updater.isCompleteDownload(12345, 0)).toBe(true)
  })

  test('requires exact byte match when a length is known', () => {
    expect(updater.isCompleteDownload(1000, 1000)).toBe(true)
    expect(updater.isCompleteDownload(999, 1000)).toBe(false) // truncated
    expect(updater.isCompleteDownload(0, 1000)).toBe(false) // empty body
  })
})

describe('shQuote', () => {
  test('single-quotes and escapes embedded quotes', () => {
    expect(updater.shQuote('/tmp/a b')).toBe("'/tmp/a b'")
    expect(updater.shQuote("it's")).toBe("'it'\\''s'")
  })
})
