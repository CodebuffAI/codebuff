/**
 * detectPlatformTheme() is the last-resort theme guess, reached after the
 * VS Code / JetBrains resolvers and (on POSIX) the OSC 11 background-color
 * query.
 *
 * On Windows it used to shell out to PowerShell twice — once for
 * (Get-Host).UI.RawUI.BackgroundColor and once to read HKCU
 * Themes\Personalize. Together those produced a "Suspicious PowerShell command
 * line" detection and a `cmd /d /s /c REG.exe QUERY` child in Windows
 * Defender's process tree on real user machines. The Windows branch is gone;
 * these tests hold that line, because the failure mode is invisible locally —
 * the code still "works", it just gets the CLI quarantined.
 *
 * Note OSC 11 does NOT currently back-fill Windows: index.tsx skips it when
 * platform === 'win32'. So on Windows this really is the end of the line and
 * 'dark' is the answer. See the comment in detectPlatformTheme.
 */
import { afterEach, describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from '../../__tests__/test-utils'
import { detectPlatformTheme } from '../theme-system'

// Without this, a throw anywhere in theme-system's import chain makes this
// whole FILE vanish from the run instead of failing — which would silently
// disable the very regression these tests exist to catch.
ensureCliTestEnv()

let originalPlatform: PropertyDescriptor | undefined
const originalSpawnSync = Bun.spawnSync
const originalWhich = Bun.which

/**
 * Record every subprocess detectPlatformTheme tries to start.
 *
 * Bun.which is stubbed too: runSystemCommand resolves the binary before
 * spawning, so on a mac runner `gsettings` would resolve to null and the linux
 * branch would never reach spawnSync — the test would then pass whether or not
 * the code tried to run anything.
 */
function captureSpawns(stdout = ''): string[][] {
  const calls: string[][] = []
  // Resolves to the bare name so assertions read as the command we wrote.
  ;(Bun as { which: unknown }).which = ((binary: string) =>
    binary) as typeof Bun.which
  ;(Bun as { spawnSync: unknown }).spawnSync = ((options: unknown) => {
    const cmd = (options as { cmd?: string[] })?.cmd ?? []
    calls.push(cmd)
    // Only the fields runSystemCommand reads; cast through unknown because the
    // real SyncSubprocess carries pid/resourceUsage/success we don't need.
    return { exitCode: 0, stdout, stderr: '' } as unknown
  }) as unknown as typeof Bun.spawnSync
  return calls
}

function setPlatform(platform: NodeJS.Platform) {
  originalPlatform ??= Object.getOwnPropertyDescriptor(process, 'platform')
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
}

afterEach(() => {
  ;(Bun as { spawnSync: unknown }).spawnSync = originalSpawnSync
  ;(Bun as { which: unknown }).which = originalWhich
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform)
    originalPlatform = undefined
  }
})

describe('detectPlatformTheme on windows', () => {
  test('starts no subprocess at all', () => {
    setPlatform('win32')
    const calls = captureSpawns()

    detectPlatformTheme()

    expect(calls).toEqual([])
  })

  test('falls back to dark', () => {
    setPlatform('win32')
    captureSpawns()

    // Matches what the old registry read returned for a default Windows
    // Terminal profile, so this is not a behavior change for most users.
    expect(detectPlatformTheme()).toBe('dark')
  })
})

describe('detectPlatformTheme on other platforms', () => {
  test('still asks macOS for AppleInterfaceStyle', () => {
    setPlatform('darwin')
    const calls = captureSpawns('Dark')

    expect(detectPlatformTheme()).toBe('dark')
    expect(calls[0]).toEqual([
      'defaults',
      'read',
      '-g',
      'AppleInterfaceStyle',
    ])
  })

  test('treats a missing macOS AppleInterfaceStyle as light', () => {
    setPlatform('darwin')
    captureSpawns('')

    expect(detectPlatformTheme()).toBe('light')
  })

  test('still asks GNOME for its color-scheme', () => {
    setPlatform('linux')
    const calls = captureSpawns("'prefer-dark'")

    expect(detectPlatformTheme()).toBe('dark')
    expect(calls[0]).toEqual([
      'gsettings',
      'get',
      'org.gnome.desktop.interface',
      'color-scheme',
    ])
  })
})
