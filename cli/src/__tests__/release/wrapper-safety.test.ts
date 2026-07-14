import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const require = createRequire(import.meta.url)

const wrappers = [
  {
    name: 'codebuff',
    directory: 'cli/release',
    expectedConfig: {
      packageName: 'codebuff',
      displayName: 'Codebuff',
      tempDownloadDirName: '.download-temp',
    },
  },
  {
    name: 'codecane',
    directory: 'cli/release-staging',
    expectedConfig: {
      packageName: 'codecane',
      displayName: 'Codecane',
      includeTreeSitterWasm: false,
      telemetryProperties: { isStaging: true },
      tempDownloadDirName: '.download-temp-staging',
    },
  },
  {
    name: 'freebuff',
    directory: 'freebuff/cli/release',
    expectedConfig: {
      packageName: 'freebuff',
      displayName: 'Freebuff',
      telemetryEvent: 'cli.update_freebuff_failed',
    },
  },
]

for (const wrapper of wrappers) {
  describe(`${wrapper.name} release wrapper`, () => {
    test('contains only product configuration and package loading', () => {
      const wrapperModule = require(
        join(repoRoot, wrapper.directory, 'index.js'),
      )
      expect(wrapperModule.config).toMatchObject(wrapper.expectedConfig)
    })

    test('has package-only lifecycle scripts', () => {
      const packageJson = JSON.parse(
        readFileSync(join(repoRoot, wrapper.directory, 'package.json'), 'utf8'),
      )
      expect(packageJson.scripts?.preinstall).toBeUndefined()
      expect(packageJson.scripts?.install).toBeUndefined()
      expect(packageJson.scripts?.postinstall).toBeUndefined()
      expect(packageJson.scripts?.preuninstall).toBeUndefined()
      expect(packageJson.scripts?.prepack).toContain('prepare-package.js')
      expect(packageJson.scripts?.postpack).toContain('prepare-package.js')
      expect(packageJson.files).toContain('launcher.js')
      expect(packageJson.files).toContain('http.js')
    })

    test('prefers its bundled launcher over a source-path collision', () => {
      const fixtureRoot = mkdtempSync(
        join(tmpdir(), `${wrapper.name}-wrapper-`),
      )
      const fixtureWrapperDir = join(fixtureRoot, wrapper.directory)
      const fixtureSourceDir = join(fixtureRoot, 'cli/release-core')

      try {
        mkdirSync(fixtureWrapperDir, { recursive: true })
        mkdirSync(fixtureSourceDir, { recursive: true })
        copyFileSync(
          join(repoRoot, wrapper.directory, 'index.js'),
          join(fixtureWrapperDir, 'index.js'),
        )

        const fakeLauncher = (origin: string) => `
          module.exports = {
            createLauncher(config) {
              return { config, main: async () => {}, origin: '${origin}' }
            },
          }
        `
        writeFileSync(
          join(fixtureWrapperDir, 'launcher.js'),
          fakeLauncher('packaged'),
        )
        writeFileSync(
          join(fixtureSourceDir, 'launcher.js'),
          fakeLauncher('source'),
        )

        const wrapperModule = require(join(fixtureWrapperDir, 'index.js'))
        expect(wrapperModule.origin).toBe('packaged')
      } finally {
        rmSync(fixtureRoot, { recursive: true, force: true })
      }
    })
  })
}

describe('shared release launcher safety', () => {
  const launcherPath = join(repoRoot, 'cli/release-core/launcher.js')
  const { createLauncher } = require(launcherPath)

  test('stages an update before stopping the running process', () => {
    const source = readFileSync(launcherPath, 'utf8')
    const updateFunction = source.slice(
      source.indexOf('async function checkForUpdates'),
    )
    const stageIndex = updateFunction.indexOf(
      'const stagedBinary = await stageBinary',
    )
    const stopIndex = updateFunction.indexOf(
      'await stopRunningProcess(runningProcess)',
    )
    const installIndex = updateFunction.indexOf(
      'installStagedBinary(stagedBinary)',
    )

    expect(stageIndex).toBeGreaterThan(-1)
    expect(stopIndex).toBeGreaterThan(stageIndex)
    expect(installIndex).toBeGreaterThan(stopIndex)
  })

  test('cleans up process-stop listeners and timers', async () => {
    const { stopRunningProcess } = createLauncher({
      packageName: 'test',
      displayName: 'Test',
    })
    const runningProcess = new EventEmitter() as EventEmitter & {
      kill(signal: string): boolean
    }
    const signals: string[] = []
    runningProcess.kill = (signal) => {
      signals.push(signal)
      runningProcess.emit('exit', 0, null)
      return true
    }

    await stopRunningProcess(runningProcess)

    expect(signals).toEqual(['SIGTERM'])
    expect(runningProcess.listenerCount('exit')).toBe(0)
  })

  test('cleans up when stopping the process throws', async () => {
    const { stopRunningProcess } = createLauncher({
      packageName: 'test',
      displayName: 'Test',
    })
    const runningProcess = new EventEmitter() as EventEmitter & {
      kill(signal: string): boolean
    }
    runningProcess.kill = () => {
      throw new Error('kill failed')
    }

    await expect(stopRunningProcess(runningProcess)).rejects.toThrow(
      'kill failed',
    )
    expect(runningProcess.listenerCount('exit')).toBe(0)
  })
})
