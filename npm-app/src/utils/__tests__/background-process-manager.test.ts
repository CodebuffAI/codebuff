// @ts-ignore: bun:test types aren't available
import { test } from 'bun:test'
// @ts-ignore: bun:test types aren't available
import { afterEach, beforeEach, describe, expect, mock, spyOn } from 'bun:test'

import {
  BackgroundProcessInfo,
  getBackgroundProcessInfoString,
} from '../../background-process-manager'

// Mock the child process
const mockChildProcess = {
  exitCode: null,
  signalCode: null,
} as any

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

    const result = getBackgroundProcessInfoString(info)

    expect(result).toContain('<background_process>')
    expect(result).toContain('<process_id>123</process_id>')
    expect(result).toContain('<command>npm test</command>')
    expect(result).toContain('<duration_ms>2000</duration_ms>')
    expect(result).toContain('<status>running</status>')
    expect(result).toContain('<stdout>test output</stdout>')
    expect(result).toContain('<stderr>test error</stderr>')
    expect(result).not.toContain('<exit_code>')
    expect(result).not.toContain('<signal_code>')
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

    const result = getBackgroundProcessInfoString(info)

    expect(result).toContain('<background_process>')
    expect(result).toContain('<process_id>456</process_id>')
    expect(result).toContain('<command>npm build</command>')
    expect(result).toContain('<duration_ms>1000</duration_ms>')
    expect(result).toContain('<status>completed</status>')
    expect(result).toContain('<exit_code>0</exit_code>')
    expect(result).toContain('<stdout>build successful</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
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

    const result = getBackgroundProcessInfoString(info)

    expect(result).toContain('<background_process>')
    expect(result).toContain('<process_id>789</process_id>')
    expect(result).toContain('<command>invalid-command</command>')
    expect(result).toContain('<duration_ms>1500</duration_ms>')
    expect(result).toContain('<status>error</status>')
    expect(result).toContain('<exit_code>1</exit_code>')
    expect(result).toContain('<signal_code>SIGTERM</signal_code>')
    expect(result).toContain('<stdout>[NO NEW OUTPUT]</stdout>')
    expect(result).toContain('<stderr>command not found</stderr>')
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).toBe('')
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

    const result = getBackgroundProcessInfoString(info)

    expect(result).toContain('<duration_ms>1000</duration_ms>')
    expect(result).toContain('<stdout>[PREVIOUS OUTPUT]\n more output</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
  })

  test('returns [NO NEW OUTPUT] when no new content', () => {
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).toContain('<duration_ms>1000</duration_ms>')
    expect(result).toContain('<stdout>[NO NEW OUTPUT]</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
  })

  test('shows new stderr without [PREVIOUS OUTPUT] when no previous stderr', () => {
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).toContain('<duration_ms>1000</duration_ms>')
    expect(result).toContain('<stdout>[NO NEW OUTPUT]</stdout>')
    expect(result).toContain('<stderr>new error</stderr>')
  })

  test('shows new stdout without [PREVIOUS OUTPUT] when no previous stdout', () => {
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).toContain('<duration_ms>2000</duration_ms>')
    expect(result).toContain('<stdout>first output</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).not.toBe('')
    expect(result).toContain('<duration_ms>1000</duration_ms>')
    expect(result).toContain('<stdout>[NO NEW OUTPUT]</stdout>')
    expect(result).toContain('<stderr>new error</stderr>')
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).not.toBe('')
    expect(result).toContain('<duration_ms>1000</duration_ms>')
    expect(result).toContain('<stdout>[PREVIOUS OUTPUT]\n more</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).not.toBe('')
    expect(result).toContain('<duration_ms>1000</duration_ms>')
    expect(result).toContain('<stdout>[NO NEW OUTPUT]</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
    expect(result).toContain('<status>completed</status>')
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).toContain('<duration_ms>1500</duration_ms>') // endTime - startTime = 1500
    expect(result).toContain('<stdout>test</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
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

    const result = getBackgroundProcessInfoString(info)
    expect(result).toContain('<duration_ms>2000</duration_ms>') // currentTime - startTime = 2000
    expect(result).toContain('<stdout>test</stdout>')
    expect(result).toContain('<stderr>[NO NEW OUTPUT]</stderr>')
  })
})
