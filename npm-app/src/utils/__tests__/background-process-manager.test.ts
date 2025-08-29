// @ts-ignore
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'

// Import only the type, not the implementation
import type { BackgroundProcessInfo } from '../../background-process-manager'

// Mock the child process
const mockChildProcess = {
  exitCode: null,
  signalCode: null,
} as any

// Check if we are in CI/CD
const isCI = process.env.CODEBUFF_GITHUB_ACTIONS === 'true'

// Skip tests entirely in CI
if (!isCI) {
  // Wrap the dynamic import and tests in an async IIFE to avoid top-level await
  ;(async () => {
    // Only import the implementation if not in CI
    const { getBackgroundProcessUpdate } = await import(
      '../../background-process-manager'
    )

    describe('getBackgroundProcessInfoString', () => {
      let dateNowSpy: ReturnType<typeof spyOn>
      const currentTime = 3000

      beforeEach(() => {
        spyOn(Date, 'now').mockReturnValue(currentTime)
      })

      afterEach(() => {
        mock.restore()
      })

      test('formats a running process correctly', () => {
        const startTime = 1000

        const info: BackgroundProcessInfo = {
          pid: 123,
          toolCallId: 'toolCall123',
          command: 'npm test',
          process: mockChildProcess,
          stdoutBuffer: ['test output'],
          stderrBuffer: ['test error'],
          status: 'running',
          startTime,
          endTime: null,
          lastReportedStdoutLength: 0,
          lastReportedStderrLength: 0,
          lastReportedStatus: null,
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('formats a completed process correctly', () => {
        const startTime = 1000
        const endTime = 2000

        const mockCompletedProcess = {
          ...mockChildProcess,
          exitCode: 0,
        }

        const info: BackgroundProcessInfo = {
          pid: 456,
          toolCallId: 'toolCall456',
          command: 'npm build',
          process: mockCompletedProcess,
          stdoutBuffer: ['build successful'],
          stderrBuffer: [],
          status: 'completed',
          startTime,
          endTime,
          lastReportedStdoutLength: 0,
          lastReportedStderrLength: 0,
          lastReportedStatus: null,
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('formats an errored process correctly', () => {
        const startTime = 1000
        const endTime = 2500

        const mockErroredProcess = {
          ...mockChildProcess,
          exitCode: 1,
          signalCode: 'SIGTERM',
        }

        const info: BackgroundProcessInfo = {
          pid: 789,
          toolCallId: 'toolCall789',
          command: 'invalid-command',
          process: mockErroredProcess,
          stdoutBuffer: [],
          stderrBuffer: ['command not found'],
          status: 'error',
          startTime,
          endTime,
          lastReportedStdoutLength: 0,
          lastReportedStderrLength: 0,
          lastReportedStatus: null,
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('returns empty string for completed process with no changes', () => {
        const startTime = 1000
        const endTime = 2000

        const info: BackgroundProcessInfo = {
          pid: 101,
          toolCallId: 'toolCall101',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test'],
          stderrBuffer: [],
          status: 'completed',
          startTime,
          endTime,
          lastReportedStdoutLength: 4, // Length of 'test'
          lastReportedStderrLength: 0,
          lastReportedStatus: 'completed',
        }

        const result = getBackgroundProcessUpdate(info)
        expect(Boolean(result)).toBeFalse()
      })

      test('handles new output since last report', () => {
        const startTime = 1000
        const endTime = 2000

        const info: BackgroundProcessInfo = {
          pid: 102,
          toolCallId: 'toolCall102',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test', ' more output'],
          stderrBuffer: [],
          status: 'completed',
          startTime,
          endTime,
          lastReportedStdoutLength: 4, // Only 'test' was reported
          lastReportedStderrLength: 0,
          lastReportedStatus: 'completed',
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('handles no new content', () => {
        const startTime = 1000
        const endTime = 2000

        const info: BackgroundProcessInfo = {
          pid: 103,
          toolCallId: 'toolCall103',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test'],
          stderrBuffer: [],
          status: 'running',
          startTime,
          endTime,
          lastReportedStdoutLength: 4, // All content reported
          lastReportedStderrLength: 0,
          lastReportedStatus: 'running',
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('handles new stderr without when no previous stderr', () => {
        const startTime = 1000
        const endTime = 2000

        const info: BackgroundProcessInfo = {
          pid: 104,
          toolCallId: 'toolCall104',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: [],
          stderrBuffer: ['new error'],
          status: 'error',
          startTime,
          endTime,
          lastReportedStdoutLength: 0,
          lastReportedStderrLength: 0, // No previous stderr
          lastReportedStatus: null,
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('handles new stdout without when no previous stdout', () => {
        const startTime = 1000

        const info: BackgroundProcessInfo = {
          pid: 105,
          toolCallId: 'toolCall105',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['first output'],
          stderrBuffer: [],
          status: 'running',
          startTime,
          endTime: null,
          lastReportedStdoutLength: 0, // No previous stdout
          lastReportedStderrLength: 0,
          lastReportedStatus: null,
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('reports completed process with new stderr even if stdout unchanged', () => {
        const startTime = 1000
        const endTime = 2000

        const info: BackgroundProcessInfo = {
          pid: 106,
          toolCallId: 'toolCall106',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test'],
          stderrBuffer: ['new error'],
          status: 'completed',
          startTime,
          endTime,
          lastReportedStdoutLength: 4, // All stdout reported
          lastReportedStderrLength: 0, // No stderr reported
          lastReportedStatus: 'completed',
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('reports completed process with new stdout even if stderr unchanged', () => {
        const startTime = 1000
        const endTime = 2000

        const info: BackgroundProcessInfo = {
          pid: 107,
          toolCallId: 'toolCall107',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test', ' more'],
          stderrBuffer: ['error'],
          status: 'completed',
          startTime,
          endTime,
          lastReportedStdoutLength: 4, // Only 'test' reported
          lastReportedStderrLength: 5, // All stderr reported
          lastReportedStatus: 'completed',
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('reports process when status changes even without output changes', () => {
        const startTime = 1000
        const endTime = 2000

        const info: BackgroundProcessInfo = {
          pid: 108,
          toolCallId: 'toolCall108',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test'],
          stderrBuffer: [],
          status: 'completed',
          startTime,
          endTime,
          lastReportedStdoutLength: 4, // All output reported
          lastReportedStderrLength: 0,
          lastReportedStatus: 'running', // Status changed from running to completed
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('calculates duration from endTime when available', () => {
        const startTime = 1000
        const endTime = 2500

        const info: BackgroundProcessInfo = {
          pid: 109,
          toolCallId: 'toolCall109',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test'],
          stderrBuffer: [],
          status: 'completed',
          startTime,
          endTime,
          lastReportedStdoutLength: 0,
          lastReportedStderrLength: 0,
          lastReportedStatus: null,
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })

      test('calculates duration from current time when no endTime', () => {
        const startTime = 1000

        const info: BackgroundProcessInfo = {
          pid: 110,
          toolCallId: 'toolCall110',
          command: 'echo test',
          process: mockChildProcess,
          stdoutBuffer: ['test'],
          stderrBuffer: [],
          status: 'running',
          startTime,
          endTime: null,
          lastReportedStdoutLength: 0,
          lastReportedStderrLength: 0,
          lastReportedStatus: null,
        }

        const result = getBackgroundProcessUpdate(info)

        expect(result).toMatchSnapshot()
      })
    })
  })()
} else {
  // Add a skipped describe block for clarity in test reports
  describe.skip('getBackgroundProcessInfoString (skipped in CI)', () => {
    test.skip('skipped', () => {})
  })
}
