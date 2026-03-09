#!/usr/bin/env bun
/**
 * Freebuff Binary Smoke Test
 *
 * Verifies the compiled Freebuff binary:
 * 1. Reports a valid version number
 * 2. Shows Freebuff branding (not Codebuff) in --help output
 * 3. Excludes mode flags (--free, --max, --plan) from --help
 * 4. Renders the Freebuff title screen (ASCII logo) in tmux
 *
 * Prerequisites:
 *   bun freebuff/cli/build.ts <version>   # build the binary
 *   brew install tmux                     # for title-screen test
 *
 * Run:
 *   bun test freebuff/cli/smoke-test.test.ts
 */

import { execFileSync, execSync, spawn } from 'child_process'
import { existsSync } from 'fs'
import path from 'path'

import { describe, test, expect, afterEach } from 'bun:test'

const REPO_ROOT = path.join(__dirname, '..', '..')
const BINARY_PATH = path.join(REPO_ROOT, 'cli', 'bin', 'freebuff')
const TIMEOUT_MS = 20_000

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function stripAnsiCodes(str: string): string {
  // eslint-disable-next-line no-control-regex
  return str.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, '')
}

function isTmuxAvailable(): boolean {
  if (process.env.CI === 'true' || process.env.CI === '1') return false
  try {
    execSync(
      'which tmux && tmux new-session -d -s __freebuff_tmux_check__ && tmux kill-session -t __freebuff_tmux_check__',
      { stdio: 'pipe', timeout: 5000 },
    )
    return true
  } catch {
    return false
  }
}

function tmux(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tmux', args, { stdio: 'pipe' })
    let stdout = ''
    let stderr = ''
    proc.stdout?.on('data', (d: Buffer) => {
      stdout += d.toString()
    })
    proc.stderr?.on('data', (d: Buffer) => {
      stderr += d.toString()
    })
    proc.on('close', (code) => {
      if (code === 0) resolve(stdout)
      else reject(new Error(`tmux failed (exit ${code}): ${stderr}`))
    })
  })
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function runBinary(args: string[]): string {
  return execFileSync(BINARY_PATH, args, {
    encoding: 'utf-8',
    timeout: 10_000,
    env: { ...process.env, NO_COLOR: '1' },
  })
}

const binaryExists = existsSync(BINARY_PATH)
const tmuxAvailable = isTmuxAvailable()

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe.skipIf(!binaryExists)('Freebuff Binary Smoke Tests', () => {
  test(
    '--version outputs a valid semver version',
    () => {
      const output = stripAnsiCodes(runBinary(['--version'])).trim()
      // The binary may print env info before the version; grab the last line
      const lastLine =
        output
          .split('\n')
          .filter((l) => l.trim())
          .pop() ?? ''
      expect(lastLine.trim()).toMatch(/^\d+\.\d+\.\d+/)
    },
    TIMEOUT_MS,
  )

  test(
    '--help shows Freebuff branding',
    () => {
      const output = stripAnsiCodes(runBinary(['--help']))

      // CLI name is "freebuff"
      expect(output).toContain('Usage: freebuff')
      // Description is Freebuff-specific
      expect(output).toContain('Free AI coding assistant')
      // Must NOT contain the Codebuff CLI name in the usage line
      expect(output).not.toContain('Usage: codebuff')
    },
    TIMEOUT_MS,
  )

  test(
    '--help excludes mode flags (Freebuff is free-only)',
    () => {
      const output = stripAnsiCodes(runBinary(['--help']))

      // Mode flags should not be present in Freebuff
      expect(output).not.toMatch(/--free\b/)
      expect(output).not.toMatch(/--max\b/)
      expect(output).not.toMatch(/--plan\b/)
      expect(output).not.toMatch(/--lite\b/)
    },
    TIMEOUT_MS,
  )

  // -------------------------------------------------------------------------
  // tmux title-screen test
  // -------------------------------------------------------------------------

  describe.skipIf(!tmuxAvailable)('tmux title screen', () => {
    let sessionName = ''

    afterEach(async () => {
      if (sessionName) {
        try {
          await tmux(['kill-session', '-t', sessionName])
        } catch {
          // session may have already exited
        }
        sessionName = ''
      }
    })

    test(
      'displays Freebuff ASCII logo on startup',
      async () => {
        sessionName = `freebuff-smoke-${Date.now()}`

        // Start the binary in a detached tmux session
        await tmux([
          'new-session',
          '-d',
          '-s',
          sessionName,
          '-x',
          '120',
          '-y',
          '35',
          BINARY_PATH,
        ])

        // Poll until the title screen renders (ASCII art uses block chars)
        let cleanOutput = ''
        for (let attempt = 0; attempt < 20; attempt++) {
          await sleep(500)
          const raw = await tmux(['capture-pane', '-t', sessionName, '-p'])
          cleanOutput = stripAnsiCodes(raw)

          // Block characters from the ASCII logo indicate the title screen rendered
          if (cleanOutput.includes('██')) break
        }

        // Bail with a descriptive error if the title screen never appeared
        if (!cleanOutput.includes('██')) {
          throw new Error(
            `Freebuff title screen did not render within 10s. Captured output:\n${cleanOutput}`,
          )
        }

        // Verify it's the FREEBUFF logo, not CODEBUFF.
        // The Freebuff 'F' character's third line starts with the crossbar:
        //   █████╗  ██████╔╝
        // whereas Codebuff 'C' has:
        //   ██║     ██║   ██║
        // We check for the F + R pattern on line 3 of the logo.
        expect(cleanOutput).toContain('█████╗  ██████╔╝')

        // The Codebuff logo's distinctive C+O opening should NOT appear
        expect(cleanOutput).not.toContain('██╔════╝██╔═══██╗')
      },
      TIMEOUT_MS,
    )
  })
})

// Show skip messages so test output is informative
if (!binaryExists) {
  describe('Freebuff Binary Required', () => {
    test.skip(
      'Build the binary first: bun freebuff/cli/build.ts <version>',
      () => {},
    )
  })
}

if (binaryExists && !tmuxAvailable) {
  describe('tmux Required for Title Screen Test', () => {
    test.skip(
      'Install tmux: brew install tmux (macOS) or apt-get install tmux (Linux)',
      () => {},
    )
  })
}
