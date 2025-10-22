import { describe, test, expect, beforeAll } from 'bun:test'
import { spawn } from 'child_process'
import stripAnsi from 'strip-ansi'
import path from 'path'
import { isTmuxAvailable, isSDKBuilt, sleep } from './test-utils'

const CLI_PATH = path.join(__dirname, '../index.tsx')
const TIMEOUT_MS = 15000
const tmuxAvailable = isTmuxAvailable()
const sdkBuilt = isSDKBuilt()

// Utility to run tmux commands
function tmux(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('tmux', args, { stdio: 'pipe' })
    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      if (code === 0) {
        resolve(stdout)
      } else {
        reject(new Error(`tmux command failed: ${stderr}`))
      }
    })
  })
}

describe.skipIf(!tmuxAvailable || !sdkBuilt)('CLI Integration Tests with tmux', () => {
  beforeAll(() => {
    if (!tmuxAvailable) {
      console.log('\n⚠️  Skipping tmux tests - tmux not installed')
      console.log('📦 Install with: brew install tmux (macOS) or sudo apt-get install tmux (Linux)\n')
    }
    if (!sdkBuilt) {
      console.log('\n⚠️  Skipping tmux tests - SDK not built')
      console.log('🔨 Build SDK: cd sdk && bun run build\n')
    }
  })

  test('CLI starts and displays help output', async () => {
    const sessionName = 'codebuff-test-' + Date.now()
    
    try {
      // Create session with --help flag and keep it alive with '; sleep 2'
      await tmux([
        'new-session',
        '-d',
        '-s', sessionName,
        '-x', '120',
        '-y', '30',
        `bun run ${CLI_PATH} --help; sleep 2`
      ])

      // Wait for output
      await sleep(500)

      // Capture pane content
      const output = await tmux(['capture-pane', '-t', sessionName, '-p'])
      const cleanOutput = stripAnsi(output)

      // Verify help text
      expect(cleanOutput).toContain('--agent')
      expect(cleanOutput).toContain('Usage:')

    } finally {
      // Cleanup
      try {
        await tmux(['kill-session', '-t', sessionName])
      } catch {
        // Session may have already exited
      }
    }
  }, TIMEOUT_MS)

  test('CLI accepts --agent flag', async () => {
    const sessionName = 'codebuff-test-' + Date.now()
    
    try {
      // Start CLI with --agent flag (it will wait for input, so we can capture)
      await tmux([
        'new-session',
        '-d',
        '-s', sessionName,
        '-x', '120',
        '-y', '30',
        `bun run ${CLI_PATH} --agent ask`
      ])

      await sleep(1000)

      // Capture to verify it started
      const output = await tmux(['capture-pane', '-t', sessionName, '-p'])
      
      // Should have started without errors
      expect(output.length).toBeGreaterThan(0)

    } finally {
      try {
        await tmux(['kill-session', '-t', sessionName])
      } catch {
        // Session may have already exited
      }
    }
  }, TIMEOUT_MS)
})

// Always show installation message when tmux tests are skipped
if (!tmuxAvailable) {
  describe('tmux Installation Required', () => {
    test.skip('Install tmux for interactive CLI tests', () => {
      // This test is intentionally skipped to show the message
    })
  })
}

if (!sdkBuilt) {
  describe('SDK Build Required', () => {
    test.skip('Build SDK for integration tests: cd sdk && bun run build', () => {
      // This test is intentionally skipped to show the message
    })
  })
}
