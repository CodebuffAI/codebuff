import { spawn } from 'child_process'
import path from 'path'

import { describe, test, expect, beforeAll } from 'bun:test'

import {
  isTmuxAvailable,
  isSDKBuilt,
  sleep,
  ensureCliTestEnv,
  getDefaultCliEnv,
  parseRerenderLogs,
  analyzeRerenders,
  clearCliDebugLog,
} from './test-utils'

const CLI_PATH = path.join(__dirname, '../index.tsx')
const DEBUG_LOG_PATH = path.join(__dirname, '../../../debug/cli.jsonl')
const TIMEOUT_MS = 45000
const tmuxAvailable = isTmuxAvailable()
const sdkBuilt = isSDKBuilt()

ensureCliTestEnv()

/**
 * Re-render performance thresholds.
 * These values are based on observed behavior after optimization.
 * If these thresholds are exceeded, it likely indicates a performance regression.
 */
const RERENDER_THRESHOLDS = {
  /** Maximum total re-renders across all messages for a simple prompt */
  maxTotalRerenders: 20,

  /** Maximum re-renders for any single message */
  maxRerenderPerMessage: 12,

  /**
   * Props that should NEVER appear in changedProps after memoization fixes.
   * If these appear, it means callbacks are not properly memoized.
   */
  forbiddenChangedProps: [
    'onOpenFeedback',
    'onToggleCollapsed',
    'onBuildFast',
    'onBuildMax',
    'onBuildFree',
    'onCloseFeedback',
  ],

  /**
   * Maximum times streamingAgents should appear in changedProps.
   * After Set stabilization, this should be very low.
   */
  maxStreamingAgentChanges: 5,
}

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

/**
 * Send input to the CLI using bracketed paste mode.
 * Standard send-keys doesn't work with OpenTUI - see tmux.knowledge.md
 */
async function sendCliInput(sessionName: string, text: string): Promise<void> {
  await tmux([
    'send-keys',
    '-t',
    sessionName,
    '-l',
    `\x1b[200~${text}\x1b[201~`,
  ])
}

describe.skipIf(!tmuxAvailable || !sdkBuilt)(
  'Re-render Performance Tests',
  () => {
    beforeAll(async () => {
      if (!tmuxAvailable) {
        console.log('\n⚠️  Skipping re-render perf tests - tmux not installed')
        console.log(
          '📦 Install with: brew install tmux (macOS) or sudo apt-get install tmux (Linux)\n',
        )
      }
      if (!sdkBuilt) {
        console.log('\n⚠️  Skipping re-render perf tests - SDK not built')
        console.log('🔨 Build SDK: cd sdk && bun run build\n')
      }
      if (tmuxAvailable && sdkBuilt) {
        const envVars = getDefaultCliEnv()
        const entries = Object.entries(envVars)
        // Propagate environment into tmux server
        await Promise.all(
          entries.map(([key, value]) =>
            tmux(['set-environment', '-g', key, value]),
          ),
        )
        // Enable performance testing
        await tmux(['set-environment', '-g', 'CODEBUFF_PERF_TEST', 'true'])
      }
    })

    test(
      'MessageBlock re-renders stay within acceptable limits',
      async () => {
        const sessionName = 'codebuff-perf-test-' + Date.now()

        // Clear the debug log before test
        clearCliDebugLog(DEBUG_LOG_PATH)

        try {
          // Start CLI with perf testing enabled
          await tmux([
            'new-session',
            '-d',
            '-s',
            sessionName,
            '-x',
            '120',
            '-y',
            '30',
            `CODEBUFF_PERF_TEST=true bun run ${CLI_PATH}`,
          ])

          // Wait for CLI to initialize
          await sleep(5000)

          // Send a simple prompt that will trigger streaming response
          await sendCliInput(sessionName, 'what is 2+2')
          await tmux(['send-keys', '-t', sessionName, 'Enter'])

          // Wait for response to complete (longer wait for API response)
          await sleep(15000)

          // Parse and analyze the re-render logs
          const entries = parseRerenderLogs(DEBUG_LOG_PATH)
          const analysis = analyzeRerenders(entries)

          // Log analysis for debugging
          console.log('\n📊 Re-render Analysis:')
          console.log(`   Total re-renders: ${analysis.totalRerenders}`)
          console.log(`   Max per message: ${analysis.maxRerenderPerMessage}`)
          console.log(
            `   Messages tracked: ${analysis.rerendersByMessage.size}`,
          )
          if (analysis.propChangeFrequency.size > 0) {
            console.log('   Prop change frequency:')
            for (const [prop, count] of analysis.propChangeFrequency) {
              console.log(`     - ${prop}: ${count}`)
            }
          }

          // Assert total re-renders within threshold
          expect(analysis.totalRerenders).toBeLessThanOrEqual(
            RERENDER_THRESHOLDS.maxTotalRerenders,
          )

          // Assert max re-renders per message within threshold
          expect(analysis.maxRerenderPerMessage).toBeLessThanOrEqual(
            RERENDER_THRESHOLDS.maxRerenderPerMessage,
          )

          // Assert forbidden props don't appear (memoization check)
          for (const forbiddenProp of RERENDER_THRESHOLDS.forbiddenChangedProps) {
            const count = analysis.propChangeFrequency.get(forbiddenProp) || 0
            if (count > 0) {
              console.log(
                `\n❌ Forbidden prop '${forbiddenProp}' changed ${count} times - callback not memoized!`,
              )
            }
            expect(count).toBe(0)
          }

          // Assert streamingAgents changes within threshold
          const streamingAgentChanges =
            analysis.propChangeFrequency.get('streamingAgents') || 0
          expect(streamingAgentChanges).toBeLessThanOrEqual(
            RERENDER_THRESHOLDS.maxStreamingAgentChanges,
          )

          console.log('\n✅ Re-render performance within acceptable limits')
        } finally {
          // Cleanup tmux session
          try {
            await tmux(['kill-session', '-t', sessionName])
          } catch {
            // Session may have already exited
          }
        }
      },
      TIMEOUT_MS,
    )

    test(
      'Forbidden callback props are properly memoized',
      async () => {
        const sessionName = 'codebuff-memo-test-' + Date.now()

        clearCliDebugLog(DEBUG_LOG_PATH)

        try {
          await tmux([
            'new-session',
            '-d',
            '-s',
            sessionName,
            '-x',
            '120',
            '-y',
            '30',
            `CODEBUFF_PERF_TEST=true bun run ${CLI_PATH}`,
          ])

          await sleep(5000)

          // Send multiple rapid prompts to stress test memoization
          await sendCliInput(sessionName, 'hi')
          await tmux(['send-keys', '-t', sessionName, 'Enter'])
          await sleep(8000)

          const entries = parseRerenderLogs(DEBUG_LOG_PATH)
          const analysis = analyzeRerenders(entries)

          // Check that none of the callback props appear in changed props
          const forbiddenPropsFound: string[] = []
          for (const prop of RERENDER_THRESHOLDS.forbiddenChangedProps) {
            const count = analysis.propChangeFrequency.get(prop) || 0
            if (count > 0) {
              forbiddenPropsFound.push(`${prop} (${count}x)`)
            }
          }

          if (forbiddenPropsFound.length > 0) {
            console.log(
              `\n❌ Unmemoized callbacks detected: ${forbiddenPropsFound.join(', ')}`,
            )
          }

          expect(forbiddenPropsFound).toHaveLength(0)
        } finally {
          try {
            await tmux(['kill-session', '-t', sessionName])
          } catch {}
        }
      },
      TIMEOUT_MS,
    )
  },
)

// Show helpful message when tests are skipped
if (!tmuxAvailable) {
  describe('Re-render Performance - tmux Required', () => {
    test.skip('Install tmux for performance tests', () => {})
  })
}

if (!sdkBuilt) {
  describe('Re-render Performance - SDK Required', () => {
    test.skip('Build SDK: cd sdk && bun run build', () => {})
  })
}
