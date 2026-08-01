/**
 * The Windows AVX2 path is optimistic-then-corrected: we assume AVX2 rather
 * than probing for it, because the probe used to be a PowerShell one-liner that
 * compiled a C# stub and P/Invoked kernel32!IsProcessorFeaturePresent — which
 * Windows Defender flagged as a "Suspicious PowerShell command line".
 *
 * That trade is only acceptable if the correction is airtight: a machine
 * without AVX2 must pay exactly ONE failed launch. These tests pin that down,
 * since no CI runner can actually lack AVX2.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'

import { afterEach, beforeEach, describe, expect, test } from 'bun:test'

import { ensureCliTestEnv } from './test-utils'

ensureCliTestEnv()

const { createLauncher } = require('../../release-core/launcher.js')

let tempConfigDir: string
let originalPlatform: PropertyDescriptor | undefined
let originalArch: PropertyDescriptor | undefined

/**
 * configDir is injected rather than faked through $HOME: under `bun test`,
 * os.homedir() ignores $HOME, so a test that only set HOME would silently read
 * and WRITE the developer's real ~/.config/manicode/cpu-features.json.
 *
 * platform AND arch are both faked: the branch under test is win32-only, and
 * detectMachineHasAvx2 returns early for any non-x64 arch — so on the arm64
 * runners these tests would otherwise pass without executing a line of it.
 */
function makeLauncher(
  platform: NodeJS.Platform = 'win32',
  arch: string = 'x64',
) {
  Object.defineProperty(process, 'platform', {
    value: platform,
    configurable: true,
  })
  Object.defineProperty(process, 'arch', { value: arch, configurable: true })
  return createLauncher({ packageName: 'freebuff', configDir: tempConfigDir })
    .__testing
}

beforeEach(() => {
  tempConfigDir = mkdtempSync(join(tmpdir(), 'launcher-avx2-'))
  originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform')
  originalArch = Object.getOwnPropertyDescriptor(process, 'arch')
})

afterEach(() => {
  if (originalPlatform) {
    Object.defineProperty(process, 'platform', originalPlatform)
  }
  if (originalArch) Object.defineProperty(process, 'arch', originalArch)
  rmSync(tempConfigDir, { recursive: true, force: true })
})

describe('windows AVX2 detection', () => {
  test('assumes AVX2 on a machine it knows nothing about', () => {
    const t = makeLauncher()
    // The point of the change: no probe, no subprocess, just an optimistic yes.
    expect(t.detectMachineHasAvx2()).toBe(true)
    expect(t.readCachedAvx2()).toBe(null)
  })

  test('picks the optimized target while the answer is unknown', () => {
    const t = makeLauncher()
    expect(t.getDefaultTargetKey()).toBe('win32-x64')
  })

  test('recording a failure flips the answer and persists it', () => {
    const t = makeLauncher()
    t.recordMachineLacksAvx2()

    expect(t.detectMachineHasAvx2()).toBe(false)
    expect(t.readCachedAvx2()).toBe(false)
    expect(JSON.parse(readFileSync(t.getCpuFeatureCachePath(), 'utf8'))).toEqual(
      { avx2: false },
    )
  })

  test('a recorded failure selects baseline up front on the NEXT launch', () => {
    const first = makeLauncher()
    first.recordMachineLacksAvx2()

    // A brand-new launcher over the same HOME — i.e. the next process.
    const second = makeLauncher()
    expect(second.detectMachineHasAvx2()).toBe(false)
    expect(second.getDefaultTargetKey()).toBe('win32-x64-baseline')
  })

  test('a corrupt cache file is ignored rather than throwing', () => {
    const t = makeLauncher()
    const cachePath = t.getCpuFeatureCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, 'not json{')

    expect(t.readCachedAvx2()).toBe(null)
    expect(t.detectMachineHasAvx2()).toBe(true)
  })

  test('a cache file without an avx2 boolean is ignored', () => {
    const t = makeLauncher()
    const cachePath = t.getCpuFeatureCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ avx2: 'yes' }))

    expect(t.readCachedAvx2()).toBe(null)
    expect(t.detectMachineHasAvx2()).toBe(true)
  })

  test('a recorded failure outranks CPU inference on linux too', () => {
    // Without the recorded answer this comes back true either way — a linux
    // runner advertises avx2, and on a mac runner the /proc/cpuinfo read throws
    // and defaults to true. Either way the recorded crash has to win: a binary
    // that actually died with SIGILL beats parsing a flags line.
    const t = makeLauncher('linux')
    expect(t.detectMachineHasAvx2()).toBe(true)

    t.recordMachineLacksAvx2()
    expect(makeLauncher('linux').detectMachineHasAvx2()).toBe(false)
    expect(makeLauncher('linux').getDefaultTargetKey()).toBe(
      'linux-x64-baseline',
    )
  })

  test('a cached true does not send us to baseline', () => {
    const t = makeLauncher()
    const cachePath = t.getCpuFeatureCachePath()
    mkdirSync(dirname(cachePath), { recursive: true })
    writeFileSync(cachePath, JSON.stringify({ avx2: true }))

    expect(t.detectMachineHasAvx2()).toBe(true)
    expect(t.getDefaultTargetKey()).toBe('win32-x64')
  })
})

describe('recovery after a recorded failure', () => {
  /** Simulate a completed install of `target` at `version`. */
  function installBinary(t: ReturnType<typeof makeLauncher>, target: string) {
    writeFileSync(t.CONFIG.metadataPath, JSON.stringify({ version: '1.2.3', target }))
    writeFileSync(t.CONFIG.binaryPath, 'pretend binary')
  }

  // This is the whole "costs one crash ever" claim. Recording the failure has
  // to invalidate the ALREADY-INSTALLED optimized binary, or the next launch
  // would happily re-run the exact binary that just died and crash again.
  test('the installed AVX2 binary stops counting as usable', () => {
    const first = makeLauncher()
    installBinary(first, 'win32-x64')
    expect(first.getCurrentVersion()).toBe('1.2.3')

    first.recordMachineLacksAvx2()

    const next = makeLauncher()
    expect(next.isTargetAllowedForThisMachine('win32-x64')).toBe(false)
    // null forces ensureBinaryExists() to re-download, and getDownloadTargetKey
    // then resolves to baseline.
    expect(next.getCurrentVersion()).toBe(null)
    expect(next.getDefaultTargetKey()).toBe('win32-x64-baseline')
  })

  test('an installed baseline binary keeps working after the record', () => {
    const first = makeLauncher()
    first.recordMachineLacksAvx2()
    installBinary(first, 'win32-x64-baseline')

    const next = makeLauncher()
    // Nothing should invalidate the binary we just fell back to, or the CLI
    // would re-download it on every single launch.
    expect(next.isTargetAllowedForThisMachine('win32-x64-baseline')).toBe(true)
    expect(next.getCurrentVersion()).toBe('1.2.3')
  })
})

describe('illegal-instruction detection', () => {
  test('recognizes STATUS_ILLEGAL_INSTRUCTION on windows', () => {
    const t = makeLauncher()
    // Node surfaces the NTSTATUS as a signed 32-bit int; both spellings must
    // count, because which one arrives depends on how the child was reaped.
    expect(t.isIllegalInstructionExit(0xc000001d, null)).toBe(true)
    expect(t.isIllegalInstructionExit(-1073741795, null)).toBe(true)
  })

  test('does not treat ordinary failures as an AVX2 problem', () => {
    const t = makeLauncher()
    // A false positive here would permanently pin a capable machine to the
    // slower baseline build, so the guard matters.
    expect(t.isIllegalInstructionExit(1, null)).toBe(false)
    expect(t.isIllegalInstructionExit(0, null)).toBe(false)
    // Access violation and stack overflow are native crashes, but not this one.
    expect(t.isIllegalInstructionExit(0xc0000005, null)).toBe(false)
    expect(t.isIllegalInstructionExit(0xc0000409, null)).toBe(false)
  })

  test('honors SIGILL on POSIX', () => {
    const t = makeLauncher('linux')
    expect(t.isIllegalInstructionExit(null, 'SIGILL')).toBe(true)
    expect(t.isIllegalInstructionExit(null, 'SIGTERM')).toBe(false)
  })

  test('does not read the windows status code on POSIX', () => {
    const t = makeLauncher('linux')
    // 0xc000001d is a plausible ordinary exit code elsewhere; only Windows
    // should read it as an illegal instruction.
    expect(t.isIllegalInstructionExit(0xc000001d, null)).toBe(false)
  })
})
