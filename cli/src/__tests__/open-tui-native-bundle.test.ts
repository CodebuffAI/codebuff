import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import { basename, dirname, join } from 'path'

import { afterEach, describe, expect, test } from 'bun:test'

import {
  ensureOpenTuiNativeBundle,
  getValidBundleVersion,
  sealOpenTuiNativeBundle,
} from '../../scripts/open-tui-native-bundle'

const TARGET = { platform: 'win32', arch: 'x64' } as const
const CURRENT_VERSION = '0.3.4'
const PREVIOUS_VERSION = '0.3.3'
const PACKAGE_NAME = '@opentui/core-win32-x64'

let testRoot: string | null = null

function createPackageDir(): string {
  testRoot = mkdtempSync(join(tmpdir(), 'opentui-native-bundle-test-'))
  return join(testRoot, '@opentui', 'core-win32-x64')
}

function writeCompleteBundle(packageDir: string, version: string): void {
  mkdirSync(packageDir, { recursive: true })
  writeFileSync(
    join(packageDir, 'package.json'),
    JSON.stringify({
      name: PACKAGE_NAME,
      version,
      os: [TARGET.platform],
      cpu: [TARGET.arch],
    }),
  )
  writeFileSync(join(packageDir, 'index.bun.js'), 'export default "native"')
  writeFileSync(join(packageDir, 'opentui.dll'), `dll-${version}`)
  sealOpenTuiNativeBundle(packageDir, version, TARGET)
}

function writeStagedBundle(stagingRoot: string, version: string): void {
  writeCompleteBundle(
    join(stagingRoot, 'node_modules', '@opentui', 'core-win32-x64'),
    version,
  )
}

function stagingDirectories(packageDir: string): string[] {
  const prefix = `.${basename(packageDir)}-install-`
  return readdirSync(dirname(packageDir)).filter((entry) =>
    entry.startsWith(prefix),
  )
}

function removeDirectory(directory: string): void {
  rmSync(directory, { recursive: true, force: true })
}

afterEach(() => {
  if (testRoot) {
    rmSync(testRoot, { recursive: true, force: true })
    testRoot = null
  }
})

describe('OpenTUI native bundle identity', () => {
  // The glibc and musl packages are byte-identical in layout and differ only in
  // their `name`, so validating one against the other's target silently
  // rejected a good install as "incomplete or incompatible" — which is how
  // every Linux build broke on the 0.3.4 upgrade.
  const MUSL_TARGET = { platform: 'linux', arch: 'x64', libc: 'musl' } as const
  const GLIBC_TARGET = { platform: 'linux', arch: 'x64' } as const

  function writeLinuxBundle(
    packageDir: string,
    packageName: string,
    libc?: 'musl',
  ): void {
    mkdirSync(packageDir, { recursive: true })
    writeFileSync(
      join(packageDir, 'package.json'),
      JSON.stringify({
        name: packageName,
        version: CURRENT_VERSION,
        os: ['linux'],
        cpu: ['x64'],
        ...(libc ? { libc: [libc] } : {}),
      }),
    )
    writeFileSync(join(packageDir, 'index.bun.js'), 'export default "native"')
    writeFileSync(join(packageDir, 'libopentui.so'), `so-${CURRENT_VERSION}`)
  }

  test('accepts the musl package under a musl target', () => {
    testRoot = mkdtempSync(join(tmpdir(), 'opentui-native-bundle-test-'))
    const packageDir = join(testRoot, '@opentui', 'core-linux-x64-musl')
    writeLinuxBundle(packageDir, '@opentui/core-linux-x64-musl', 'musl')

    sealOpenTuiNativeBundle(packageDir, CURRENT_VERSION, MUSL_TARGET)
    expect(getValidBundleVersion(packageDir, MUSL_TARGET)).toBe(CURRENT_VERSION)
  })

  test('rejects the musl package under a glibc target', () => {
    testRoot = mkdtempSync(join(tmpdir(), 'opentui-native-bundle-test-'))
    const packageDir = join(testRoot, '@opentui', 'core-linux-x64-musl')
    writeLinuxBundle(packageDir, '@opentui/core-linux-x64-musl', 'musl')

    expect(() =>
      sealOpenTuiNativeBundle(packageDir, CURRENT_VERSION, GLIBC_TARGET),
    ).toThrow('is incomplete or incompatible')
  })

  test('rejects the glibc package under a musl target', () => {
    testRoot = mkdtempSync(join(tmpdir(), 'opentui-native-bundle-test-'))
    const packageDir = join(testRoot, '@opentui', 'core-linux-x64')
    writeLinuxBundle(packageDir, '@opentui/core-linux-x64')

    expect(() =>
      sealOpenTuiNativeBundle(packageDir, CURRENT_VERSION, MUSL_TARGET),
    ).toThrow('is incomplete or incompatible')
  })
})

describe('OpenTUI native bundle recovery', () => {
  test('reuses a complete matching bundle', () => {
    const packageDir = createPackageDir()
    writeCompleteBundle(packageDir, CURRENT_VERSION)
    let installCalls = 0

    const result = ensureOpenTuiNativeBundle({
      packageDir,
      version: CURRENT_VERSION,
      targetInfo: TARGET,
      installBundle: () => {
        installCalls++
      },
    })

    expect(result).toBe('reused')
    expect(installCalls).toBe(0)
  })

  test.each([
    ['missing bundle', (_packageDir: string) => {}],
    [
      'missing native library',
      (packageDir: string) => {
        writeCompleteBundle(packageDir, CURRENT_VERSION)
        rmSync(join(packageDir, 'opentui.dll'))
      },
    ],
    [
      'empty native library',
      (packageDir: string) => {
        writeCompleteBundle(packageDir, CURRENT_VERSION)
        writeFileSync(join(packageDir, 'opentui.dll'), '')
      },
    ],
    [
      'nonempty truncated native library',
      (packageDir: string) => {
        writeCompleteBundle(packageDir, CURRENT_VERSION)
        writeFileSync(join(packageDir, 'opentui.dll'), 'MZ-partial')
      },
    ],
    [
      'malformed metadata',
      (packageDir: string) => {
        writeCompleteBundle(packageDir, CURRENT_VERSION)
        writeFileSync(join(packageDir, 'package.json'), '{invalid')
      },
    ],
    [
      'missing integrity receipt',
      (packageDir: string) => {
        writeCompleteBundle(packageDir, CURRENT_VERSION)
        rmSync(join(packageDir, '.freebuff-native-bundle.json'))
      },
    ],
    [
      'malformed integrity receipt',
      (packageDir: string) => {
        writeCompleteBundle(packageDir, CURRENT_VERSION)
        writeFileSync(
          join(packageDir, '.freebuff-native-bundle.json'),
          '{invalid',
        )
      },
    ],
  ])('repairs a bundle with %s', (_label, damageBundle) => {
    const packageDir = createPackageDir()
    damageBundle(packageDir)

    const result = ensureOpenTuiNativeBundle({
      packageDir,
      version: CURRENT_VERSION,
      targetInfo: TARGET,
      installBundle: (stagingRoot) => {
        writeStagedBundle(stagingRoot, CURRENT_VERSION)
      },
    })

    expect(result).toBe('installed')
    expect(getValidBundleVersion(packageDir, TARGET)).toBe(CURRENT_VERSION)
  })

  test.each([
    [
      'is interrupted',
      (_stagingRoot: string) => {
        throw new Error('install interrupted')
      },
    ],
    [
      'produces malformed output',
      (stagingRoot: string) => {
        const stagedPackageDir = join(
          stagingRoot,
          'node_modules',
          '@opentui',
          'core-win32-x64',
        )
        mkdirSync(stagedPackageDir, { recursive: true })
        writeFileSync(join(stagedPackageDir, 'package.json'), '{invalid')
      },
    ],
  ])('preserves a valid previous bundle when staging %s', (_label, stage) => {
    const packageDir = createPackageDir()
    writeCompleteBundle(packageDir, PREVIOUS_VERSION)

    expect(() =>
      ensureOpenTuiNativeBundle({
        packageDir,
        version: CURRENT_VERSION,
        targetInfo: TARGET,
        installBundle: stage,
      }),
    ).toThrow()

    expect(getValidBundleVersion(packageDir, TARGET)).toBe(PREVIOUS_VERSION)
    expect(stagingDirectories(packageDir)).toEqual([])
  })

  test('restores an orphaned recovery copy before retrying', () => {
    const packageDir = createPackageDir()
    const previousDir = `${packageDir}.previous`
    writeCompleteBundle(previousDir, PREVIOUS_VERSION)

    expect(() =>
      ensureOpenTuiNativeBundle({
        packageDir,
        version: CURRENT_VERSION,
        targetInfo: TARGET,
        installBundle: () => {
          throw new Error('retry failed')
        },
      }),
    ).toThrow('retry failed')

    expect(getValidBundleVersion(packageDir, TARGET)).toBe(PREVIOUS_VERSION)
    expect(getValidBundleVersion(previousDir, TARGET)).toBeNull()
  })

  test('reuses a valid bundle when stale recovery cleanup fails', () => {
    const packageDir = createPackageDir()
    const previousDir = `${packageDir}.previous`
    writeCompleteBundle(packageDir, CURRENT_VERSION)
    writeCompleteBundle(previousDir, PREVIOUS_VERSION)
    let installCalls = 0

    const result = ensureOpenTuiNativeBundle({
      packageDir,
      version: CURRENT_VERSION,
      targetInfo: TARGET,
      installBundle: () => {
        installCalls++
      },
      removeDirectory: (directory) => {
        if (directory === previousDir) throw new Error('recovery copy is busy')
        removeDirectory(directory)
      },
    })

    expect(result).toBe('reused')
    expect(installCalls).toBe(0)
    expect(getValidBundleVersion(packageDir, TARGET)).toBe(CURRENT_VERSION)
    expect(getValidBundleVersion(previousDir, TARGET)).toBe(PREVIOUS_VERSION)
  })

  test('keeps a successful swap when recovery cleanup fails', () => {
    const packageDir = createPackageDir()
    const previousDir = `${packageDir}.previous`
    writeCompleteBundle(packageDir, PREVIOUS_VERSION)

    const result = ensureOpenTuiNativeBundle({
      packageDir,
      version: CURRENT_VERSION,
      targetInfo: TARGET,
      installBundle: (stagingRoot) => {
        writeStagedBundle(stagingRoot, CURRENT_VERSION)
      },
      removeDirectory: (directory) => {
        if (directory === previousDir) throw new Error('recovery copy is busy')
        removeDirectory(directory)
      },
    })

    expect(result).toBe('installed')
    expect(getValidBundleVersion(packageDir, TARGET)).toBe(CURRENT_VERSION)
    expect(getValidBundleVersion(previousDir, TARGET)).toBe(PREVIOUS_VERSION)
    expect(stagingDirectories(packageDir)).toEqual([])
  })

  test('reuses a valid bundle installed by a concurrent winner', () => {
    const packageDir = createPackageDir()

    const result = ensureOpenTuiNativeBundle({
      packageDir,
      version: CURRENT_VERSION,
      targetInfo: TARGET,
      installBundle: (stagingRoot) => {
        writeStagedBundle(stagingRoot, CURRENT_VERSION)
      },
      renameDirectory: (source, destination) => {
        if (destination === packageDir) {
          writeCompleteBundle(packageDir, CURRENT_VERSION)
          throw new Error('destination already installed')
        }
        renameSync(source, destination)
      },
    })

    expect(result).toBe('reused')
    expect(getValidBundleVersion(packageDir, TARGET)).toBe(CURRENT_VERSION)
    expect(stagingDirectories(packageDir)).toEqual([])
  })

  test('restores the previous bundle when the final swap fails', () => {
    const packageDir = createPackageDir()
    writeCompleteBundle(packageDir, PREVIOUS_VERSION)
    let renameCalls = 0

    expect(() =>
      ensureOpenTuiNativeBundle({
        packageDir,
        version: CURRENT_VERSION,
        targetInfo: TARGET,
        installBundle: (stagingRoot) => {
          writeStagedBundle(stagingRoot, CURRENT_VERSION)
        },
        renameDirectory: (source, destination) => {
          renameCalls++
          if (
            renameCalls === 2 &&
            basename(destination) === basename(packageDir)
          ) {
            throw new Error('final rename failed')
          }
          renameSync(source, destination)
        },
      }),
    ).toThrow('final rename failed')

    expect(renameCalls).toBe(3)
    expect(getValidBundleVersion(packageDir, TARGET)).toBe(PREVIOUS_VERSION)
    expect(readFileSync(join(packageDir, 'opentui.dll'), 'utf8')).toBe(
      `dll-${PREVIOUS_VERSION}`,
    )
  })
})
