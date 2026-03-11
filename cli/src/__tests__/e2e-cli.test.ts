import { spawn, spawnSync } from 'child_process'
import path from 'path'

import { describe, test, expect } from 'bun:test'
import stripAnsi from 'strip-ansi'

import { isSDKBuilt, ensureCliTestEnv } from './test-utils'

const CLI_PATH = path.join(__dirname, '../index.tsx')
const TIMEOUT_MS = 10000
const sdkBuilt = isSDKBuilt()

ensureCliTestEnv()

function runCLI(
  args: string[],
): { stdout: string; stderr: string; exitCode: number | null } {
  const result = spawnSync('bun', ['run', CLI_PATH, ...args], {
    cwd: path.join(__dirname, '../..'),
    timeout: TIMEOUT_MS,
    env: process.env,
  })
  return {
    stdout: result.stdout?.toString() ?? '',
    stderr: result.stderr?.toString() ?? '',
    exitCode: result.status,
  }
}

describe.skipIf(!sdkBuilt)('CLI End-to-End Tests', () => {
  test(
    'CLI shows help with --help flag',
    () => {
      const { stdout, stderr, exitCode } = runCLI(['--help'])

      const cleanOutput = stripAnsi(stdout + stderr)
      expect(cleanOutput).toContain('--agent')
      expect(cleanOutput).toContain('Usage:')
      expect(exitCode).toBe(0)
    },
    TIMEOUT_MS,
  )

  test(
    'CLI shows help with -h flag',
    () => {
      const { stdout, stderr, exitCode } = runCLI(['-h'])

      const cleanOutput = stripAnsi(stdout + stderr)
      expect(cleanOutput).toContain('--agent')
      expect(exitCode).toBe(0)
    },
    TIMEOUT_MS,
  )

  test(
    'CLI shows version with --version flag',
    () => {
      const { stdout, stderr, exitCode } = runCLI(['--version'])

      const cleanOutput = stripAnsi(stdout + stderr)
      expect(cleanOutput).toMatch(/\d+\.\d+\.\d+|dev/)
      expect(exitCode).toBe(0)
    },
    TIMEOUT_MS,
  )

  test(
    'CLI shows version with -v flag',
    () => {
      const { stdout, stderr, exitCode } = runCLI(['-v'])

      const cleanOutput = stripAnsi(stdout + stderr)
      expect(cleanOutput).toMatch(/\d+\.\d+\.\d+|dev/)
      expect(exitCode).toBe(0)
    },
    TIMEOUT_MS,
  )

  test(
    'CLI accepts --agent flag',
    async () => {
      // Note: This will timeout and exit because we can't interact with stdin
      // But we can verify it starts without errors
      const proc = spawn('bun', ['run', CLI_PATH, '--agent', 'ask'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe',
      })

      let started = false
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve()
        }, 2000) // Increased timeout for CI environments

        // Check both stdout and stderr - CLI may output to either
        proc.stdout?.once('data', () => {
          started = true
          clearTimeout(timeout)
          resolve()
        })
        proc.stderr?.once('data', () => {
          started = true
          clearTimeout(timeout)
          resolve()
        })
      })

      proc.kill('SIGTERM')

      expect(started).toBe(true)
    },
    TIMEOUT_MS,
  )

  test(
    'CLI accepts --clear-logs flag',
    async () => {
      const proc = spawn('bun', ['run', CLI_PATH, '--clear-logs'], {
        cwd: path.join(__dirname, '../..'),
        stdio: 'pipe',
      })

      let started = false
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          resolve()
        }, 2000) // Increased timeout for CI environments

        // Check both stdout and stderr - CLI may output to either
        proc.stdout?.once('data', () => {
          started = true
          clearTimeout(timeout)
          resolve()
        })
        proc.stderr?.once('data', () => {
          started = true
          clearTimeout(timeout)
          resolve()
        })
      })

      proc.kill('SIGTERM')

      expect(started).toBe(true)
    },
    TIMEOUT_MS,
  )

  test(
    'CLI handles invalid flags gracefully',
    () => {
      const { stderr, exitCode } = runCLI(['--invalid-flag'])

      // Commander should show an error
      expect(exitCode).not.toBe(0)
      expect(stripAnsi(stderr)).toContain('error')
    },
    TIMEOUT_MS,
  )
})

// Show message when SDK tests are skipped
if (!sdkBuilt) {
  describe('SDK Build Required', () => {
    test.skip('Build SDK for E2E tests: cd sdk && bun run build', () => {
      // This test is skipped to show the build instruction
    })
  })
}
