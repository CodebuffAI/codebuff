import { ChildProcessByStdio } from 'child_process'
import { Readable } from 'stream'

import { ToolResult } from 'common/types/agent-state'
import { buildArray } from 'common/util/array'
import { truncateStringWithMessage } from 'common/util/string'

const COMMAND_OUTPUT_LIMIT = 5000 // Limit output to 10KB per stream

/**
 * Interface describing the information stored for each background process.
 */
export interface BackgroundProcessInfo {
  // OS-assigned Process ID
  pid: number
  toolCallId: string
  command: string
  // The actual child process object
  process: ChildProcessByStdio<null, Readable, Readable>
  // Buffer to store stdout chunks
  stdoutBuffer: string[]
  // Buffer to store stderr chunks
  stderrBuffer: string[]
  // Current status of the process
  status: 'running' | 'completed' | 'error'
  // Timestamp when the process was started
  startTime: number
  // Timestamp when the process ended (completed or errored)
  endTime: number | null
  // Length of stdout content that has been reported
  lastReportedStdoutLength: number
  // Length of stderr content that has been reported
  lastReportedStderrLength: number
  // Last reported status
  lastReportedStatus: 'running' | 'completed' | 'error' | null
}

/**
 * Global map storing information about active and completed background processes.
 * Keyed by the OS-assigned Process ID (PID).
 */
export const backgroundProcesses = new Map<number, BackgroundProcessInfo>()

/**
 * Gets output with context about whether there was previous content
 */
function getOutputWithContext(
  newContent: string,
  lastReportedLength: number
): string {
  if (newContent) {
    const hasOldContent = lastReportedLength > 0
    return hasOldContent ? '[PREVIOUS OUTPUT]\n' + newContent : newContent
  }
  return '[NO NEW OUTPUT]'
}

/**
 * Formats a single background process's info into a string
 */
export function getBackgroundProcessInfoString(
  info: BackgroundProcessInfo
): string {
  const newStdout = info.stdoutBuffer
    .join('')
    .slice(info.lastReportedStdoutLength)
  const newStderr = info.stderrBuffer
    .join('')
    .slice(info.lastReportedStderrLength)

  // For completed/error processes, only report if there are changes
  if (
    info.status !== 'running' &&
    !newStdout &&
    !newStderr &&
    info.status === info.lastReportedStatus
  ) {
    return ''
  }

  // Calculate duration in milliseconds
  const duration = info.endTime
    ? info.endTime - info.startTime
    : Date.now() - info.startTime

  return buildArray(
    '<background_process>',
    `  <process_id>${info.pid}</process_id>`,
    `  <command>${info.command}</command>`,
    `  <start_time_utc>${new Date(info.startTime).toISOString()}</start_time_utc>`,
    `  <duration_ms>${duration}</duration_ms>`,
    `  <terminal_command_result>`,
    `    <stdout>${truncateStringWithMessage({
      str: getOutputWithContext(newStdout, info.lastReportedStdoutLength),
      maxLength: COMMAND_OUTPUT_LIMIT,
      truncate: 'START',
    })}</stdout>`,
    `    <stderr>${truncateStringWithMessage({
      str: getOutputWithContext(newStderr, info.lastReportedStderrLength),
      maxLength: COMMAND_OUTPUT_LIMIT,
      truncate: 'START',
    })}</stderr>`,
    '  </terminal_command_result>',
    `  <status>${info.status}</status>`,
    info.process.exitCode !== null &&
      `  <exit_code>${info.process.exitCode}</exit_code>`,
    info.process.signalCode &&
      `  <signal_code>${info.process.signalCode}</signal_code>`,
    '</background_process>'
  )
    .filter(Boolean)
    .join('\n')
}

/**
 * Gets updates from all background processes and updates tracking info
 */
export function getBackgroundProcessUpdates(): ToolResult[] {
  const updates = Array.from(backgroundProcesses.values())
    .map((bgProcess) => {
      return [getBackgroundProcessInfoString(bgProcess), bgProcess.toolCallId]
    })
    .filter(([update]) => Boolean(update))

  // Update tracking info after getting updates
  for (const process of backgroundProcesses.values()) {
    process.lastReportedStdoutLength = process.stdoutBuffer.join('').length
    process.lastReportedStderrLength = process.stderrBuffer.join('').length
    process.lastReportedStatus = process.status
  }

  // Clean up completed processes that we've already reported
  cleanupReportedProcesses()

  return updates.map(([update, toolCallId]) => {
    return {
      name: 'background_process_updates',
      result: update,
      id: toolCallId,
    }
  })
}

/**
 * Removes completed processes that have been fully reported
 */
function cleanupReportedProcesses(): void {
  for (const [pid, info] of backgroundProcesses.entries()) {
    if (
      (info.status === 'completed' || info.status === 'error') &&
      info.lastReportedStatus === info.status &&
      info.lastReportedStdoutLength === info.stdoutBuffer.join('').length &&
      info.lastReportedStderrLength === info.stderrBuffer.join('').length
    ) {
      backgroundProcesses.delete(pid)
    }
  }
}
