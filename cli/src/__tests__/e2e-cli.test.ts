import { describe, test, expect } from 'bun:test'
import { spawn } from 'child_process'
import stripAnsi from 'strip-ansi'
import path from 'path'
import { isSDKBuilt } from './test-utils'

const CLI_PATH = path.join(__dirname, '../index.tsx')
const TIMEOUT_MS = 10000
const sdkBuilt = isSDKBuilt()

function runCLI(args: string[]): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
  return new Promise((resolve, reject) => {
    const proc = spawn('bun', ['run', CLI_PATH, ...args], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'pipe'
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    const timeout = setTimeout(() => {
      proc.kill('SIGTERM')
      reject(new Error('Process timeout'))
    }, TIMEOUT_MS)

    proc.on('exit', (code) => {
      clearTimeout(timeout)
      resolve({ stdout, stderr, exitCode: code })
    })

    proc.on('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

describe.skipIf(!sdkBuilt)('CLI End-to-End Tests', () => {
  test('CLI shows help with --help flag', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['--help'])
    
    const cleanOutput = stripAnsi(stdout + stderr)
    expect(cleanOutput).toContain('--agent')
    expect(cleanOutput).toContain('Usage:')
    expect(exitCode).toBe(0)
  }, TIMEOUT_MS)

  test('CLI shows help with -h flag', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['-h'])
    
    const cleanOutput = stripAnsi(stdout + stderr)
    expect(cleanOutput).toContain('--agent')
    expect(exitCode).toBe(0)
  }, TIMEOUT_MS)

  test('CLI shows version with --version flag', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['--version'])
    
    const cleanOutput = stripAnsi(stdout + stderr)
    expect(cleanOutput).toMatch(/\d+\.\d+\.\d+|dev/)
    expect(exitCode).toBe(0)
  }, TIMEOUT_MS)

  test('CLI shows version with -v flag', async () => {
    const { stdout, stderr, exitCode } = await runCLI(['-v'])
    
    const cleanOutput = stripAnsi(stdout + stderr)
    expect(cleanOutput).toMatch(/\d+\.\d+\.\d+|dev/)
    expect(exitCode).toBe(0)
  }, TIMEOUT_MS)

  test('CLI accepts --agent flag', async () => {
    // Note: This will timeout and exit because we can't interact with stdin
    // But we can verify it starts without errors
    const proc = spawn('bun', ['run', CLI_PATH, '--agent', 'ask'], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'pipe'
    })

    let started = false
    proc.stdout?.on('data', () => {
      started = true
    })

    await new Promise(resolve => setTimeout(resolve, 1000))
    proc.kill('SIGTERM')

    expect(started).toBe(true)
  }, TIMEOUT_MS)

  test('CLI accepts --clear-logs flag', async () => {
    const proc = spawn('bun', ['run', CLI_PATH, '--clear-logs'], {
      cwd: path.join(__dirname, '../..'),
      stdio: 'pipe'
    })

    let started = false
    proc.stdout?.on('data', () => {
      started = true
    })

    await new Promise(resolve => setTimeout(resolve, 1000))
    proc.kill('SIGTERM')

    expect(started).toBe(true)
  }, TIMEOUT_MS)

  test('CLI handles invalid flags gracefully', async () => {
    const { stderr, exitCode } = await runCLI(['--invalid-flag'])
    
    // Commander should show an error
    expect(exitCode).not.toBe(0)
    expect(stripAnsi(stderr)).toContain('error')
  }, TIMEOUT_MS)
})

// Show message when SDK tests are skipped
if (!sdkBuilt) {
  describe('SDK Build Required', () => {
    test.skip('Build SDK for E2E tests: cd sdk && bun run build', () => {
      // This test is skipped to show the build instruction
    })
  })
}
