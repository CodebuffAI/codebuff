import { describe, expect, test } from 'bun:test'
import { EventEmitter } from 'node:events'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url))
const require = createRequire(import.meta.url)

const wrappers = [
  {
    name: 'codebuff',
    directory: 'cli/release',
  },
  {
    name: 'codecane',
    directory: 'cli/release-staging',
  },
  {
    name: 'freebuff',
    directory: 'freebuff/cli/release',
  },
]

for (const wrapper of wrappers) {
  describe(`${wrapper.name} release wrapper safety`, () => {
    test('has no install or uninstall lifecycle scripts', () => {
      const packageJson = JSON.parse(
        readFileSync(join(repoRoot, wrapper.directory, 'package.json'), 'utf8'),
      )
      expect(packageJson.scripts?.postinstall).toBeUndefined()
      expect(packageJson.scripts?.preuninstall).toBeUndefined()
      expect(packageJson.files).not.toContain('postinstall.js')
    })

    test('stages an update before stopping the running process', () => {
      const source = readFileSync(
        join(repoRoot, wrapper.directory, 'index.js'),
        'utf8',
      )
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
      const { stopRunningProcess } = require(
        join(repoRoot, wrapper.directory, 'index.js'),
      )
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
      const { stopRunningProcess } = require(
        join(repoRoot, wrapper.directory, 'index.js'),
      )
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
}
