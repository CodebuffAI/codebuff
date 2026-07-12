import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'fs'
import { tmpdir } from 'os'
import path from 'path'
import { spawnSync } from 'child_process'
import { createRequire } from 'module'

import { describe, expect, test } from 'bun:test'

const repoRoot = path.resolve(__dirname, '../../..')
const require = createRequire(import.meta.url)
const wrappers = [
  ['release', 'cli/release/index.js'],
  ['release-staging', 'cli/release-staging/index.js'],
] as const
type WrapperName = (typeof wrappers)[number][0]
const wrapperVersions: Record<WrapperName, string> = {
  release: JSON.parse(
    readFileSync(path.join(repoRoot, 'cli/release/package.json'), 'utf8'),
  ).version,
  'release-staging': JSON.parse(
    readFileSync(
      path.join(repoRoot, 'cli/release-staging/package.json'),
      'utf8',
    ),
  ).version,
}

function runWrapperWithTarBlocked(wrapperPath: string, flag: string) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'openbuff-release-wrapper-'))
  const preloadPath = path.join(tempDir, 'block-tar.cjs')

  writeFileSync(
    preloadPath,
    `const Module = require('module')\n` +
      `const originalLoad = Module._load\n` +
      `Module._load = function(request, parent, isMain) {\n` +
      `  if (request === 'tar') throw new Error('tar should not be required for version flags')\n` +
      `  return originalLoad.apply(this, arguments)\n` +
      `}\n`,
  )

  try {
    return spawnSync(
      process.execPath,
      ['--require', preloadPath, wrapperPath, flag],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          NODE_OPTIONS: '',
        },
      },
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

function getWrapperBinaryName(wrapperName: WrapperName) {
  return wrapperName === 'release' ? 'openbuff' : 'codecane'
}

function getWrapperMetadataName(wrapperName: WrapperName) {
  return wrapperName === 'release'
    ? 'openbuff-metadata.json'
    : 'codecane-metadata.json'
}

function runWrapperWithMockPlatform({
  arch,
  hardwareArch,
  macOSVersion,
  platformKey,
  wrapperName,
  wrapperPath,
}: {
  arch: string
  hardwareArch: string
  macOSVersion?: string
  platformKey: string
  wrapperName: WrapperName
  wrapperPath: string
}) {
  const tempDir = mkdtempSync(path.join(tmpdir(), 'openbuff-release-wrapper-'))
  const preloadPath = path.join(tempDir, 'mock-platform.cjs')
  const configDir = path.join(tempDir, '.config', 'openbuff')
  const binaryName = getWrapperBinaryName(wrapperName)

  mkdirSync(configDir, { recursive: true })
  writeFileSync(
    path.join(configDir, getWrapperMetadataName(wrapperName)),
    JSON.stringify({ version: wrapperVersions[wrapperName], platformKey }),
  )
  writeFileSync(
    path.join(configDir, binaryName),
    `#!/usr/bin/env node\nprocess.kill(process.pid, 'SIGILL')\n`,
  )
  chmodSync(path.join(configDir, binaryName), 0o755)

  writeFileSync(
    preloadPath,
    `Object.defineProperty(process, 'platform', { value: 'darwin' })\n` +
      `Object.defineProperty(process, 'arch', { value: ${JSON.stringify(arch)} })\n`,
  )

  try {
    return spawnSync(
      process.execPath,
      ['--require', preloadPath, wrapperPath],
      {
        cwd: repoRoot,
        encoding: 'utf8',
        env: {
          ...process.env,
          HOME: tempDir,
          NODE_OPTIONS: '',
          OPENBUFF_TEST_HARDWARE_ARCH: hardwareArch,
          ...(macOSVersion
            ? { OPENBUFF_TEST_MACOS_VERSION: macOSVersion }
            : {}),
        },
      },
    )
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
}

describe('release wrapper version flags', () => {
  test.each(wrappers)(
    '%s --version exits before requiring tar',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithTarBlocked(wrapperPath, '--version')

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout.trim()).toBe(wrapperVersions[wrapperName])
    },
  )

  test.each(wrappers)(
    '%s -v exits before requiring tar',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithTarBlocked(wrapperPath, '-v')

      expect(result.status).toBe(0)
      expect(result.stderr).toBe('')
      expect(result.stdout.trim()).toBe(wrapperVersions[wrapperName])
    },
  )
})

describe('release wrapper platform selection', () => {
  test.each(wrappers)(
    '%s rejects Intel macOS versions older than 11',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithMockPlatform({
        arch: 'x64',
        hardwareArch: 'x64',
        macOSVersion: '10.15.7',
        platformKey: 'darwin-x64',
        wrapperName,
        wrapperPath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('requires macOS 11 or newer')
      expect(result.stderr).toContain('running macOS 10.15.7')
      expect(result.stderr).not.toContain('System info:')
    },
  )

  test.each(wrappers)(
    '%s selects the isolated Intel legacy binary on macOS 11',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithMockPlatform({
        arch: 'x64',
        hardwareArch: 'x64',
        macOSVersion: '11.7.10',
        platformKey: 'darwin-x64-legacy',
        wrapperName,
        wrapperPath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).not.toContain('requires macOS 13 or newer')
      expect(result.stderr).toContain('macOS:    11.7.10')
      expect(result.stderr).toContain(
        `Target:   darwin-x64-legacy (${getWrapperBinaryName(wrapperName)}-darwin-x64-legacy.tar.gz)`,
      )
    },
  )

  test.each(wrappers)(
    '%s rejects macOS 11 on Apple Silicon',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithMockPlatform({
        arch: 'arm64',
        hardwareArch: 'arm64',
        macOSVersion: '11.7.10',
        platformKey: 'darwin-arm64',
        wrapperName,
        wrapperPath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'Openbuff on Apple Silicon requires macOS 13 or newer',
      )
      expect(result.stderr).toContain(
        'compatibility build is currently available only for Intel Macs',
      )
      expect(result.stderr).not.toContain('System info:')
    },
  )

  test.each(wrappers)(
    '%s allows macOS 13 Intel to launch the native binary',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithMockPlatform({
        arch: 'x64',
        hardwareArch: 'x64',
        macOSVersion: '13.0',
        platformKey: 'darwin-x64',
        wrapperName,
        wrapperPath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).not.toContain('requires macOS 13 or newer')
      expect(result.stderr).toContain('macOS:    13.0')
      expect(result.stderr).toContain(
        `Target:   darwin-x64 (${getWrapperBinaryName(wrapperName)}-darwin-x64.tar.gz)`,
      )
    },
  )

  test.each(wrappers)(
    '%s selects darwin-arm64 on Apple Silicon running x64 Node under Rosetta',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithMockPlatform({
        arch: 'x64',
        hardwareArch: 'arm64',
        platformKey: 'darwin-arm64',
        wrapperName,
        wrapperPath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Platform: darwin x64')
      expect(result.stderr).toContain('Hardware: arm64')
      expect(result.stderr).toContain(
        `Target:   darwin-arm64 (${getWrapperBinaryName(wrapperName)}-darwin-arm64.tar.gz)`,
      )
    },
  )

  test.each(wrappers)(
    '%s keeps darwin-x64 for Intel Macs running x64 Node',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithMockPlatform({
        arch: 'x64',
        hardwareArch: 'x64',
        platformKey: 'darwin-x64',
        wrapperName,
        wrapperPath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Platform: darwin x64')
      expect(result.stderr).toContain('Hardware: x64')
      expect(result.stderr).toContain(
        `Target:   darwin-x64 (${getWrapperBinaryName(wrapperName)}-darwin-x64.tar.gz)`,
      )
    },
  )

  test.each(wrappers)(
    '%s keeps darwin-arm64 for Apple Silicon running arm64 Node',
    (wrapperName, wrapperPath) => {
      const result = runWrapperWithMockPlatform({
        arch: 'arm64',
        hardwareArch: 'arm64',
        platformKey: 'darwin-arm64',
        wrapperName,
        wrapperPath,
      })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Platform: darwin arm64')
      expect(result.stderr).toContain('Hardware: arm64')
      expect(result.stderr).toContain(
        `Target:   darwin-arm64 (${getWrapperBinaryName(wrapperName)}-darwin-arm64.tar.gz)`,
      )
    },
  )
})

describe('release wrapper update safety', () => {
  test.each(wrappers)(
    '%s compares prerelease versions without forcing an update loop',
    (_, wrapperPath) => {
      const { compareVersions } = require(path.join(repoRoot, wrapperPath))
      expect(compareVersions('1.2.4-beta.2', '1.2.4-beta.2')).toBe(0)
      expect(compareVersions('1.2.4-beta.2', '1.2.4-beta.3')).toBe(-1)
      expect(compareVersions('1.2.4-beta.3', '1.2.4')).toBe(-1)
    },
  )

  test.each(wrappers)(
    '%s verifies the selected release asset checksum',
    (_, wrapperPath) => {
      const { parseExpectedChecksum } = require(
        path.join(repoRoot, wrapperPath),
      )
      const digest = 'a'.repeat(64)

      expect(
        parseExpectedChecksum(
          `${'b'.repeat(64)}  unrelated.tar.gz\n${digest}  openbuff-linux-x64.tar.gz\n`,
          'openbuff-linux-x64.tar.gz',
        ),
      ).toBe(digest)
      expect(() =>
        parseExpectedChecksum(
          `${digest}  unrelated.tar.gz\n`,
          'openbuff-linux-x64.tar.gz',
        ),
      ).toThrow('Checksum missing')
    },
  )

  test.each(wrappers)(
    '%s never kills the active child during update checks',
    (_, wrapperPath) => {
      const source = readFileSync(path.join(repoRoot, wrapperPath), 'utf8')
      const updateFunction = source.slice(
        source.indexOf('async function checkForUpdates'),
        source.indexOf('function printCrashDiagnostics'),
      )

      expect(updateFunction).not.toContain('runningProcess.kill')
      expect(updateFunction).toContain('next launch')
    },
  )

  test.each([
    'cli/release/postinstall.js',
    'cli/release-staging/postinstall.js',
  ])('%s preserves the cached offline binary', (postinstallPath) => {
    const source = readFileSync(path.join(repoRoot, postinstallPath), 'utf8')
    expect(source).not.toContain('unlinkSync')
  })
})
