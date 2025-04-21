import assert from 'assert'
import {
  ChildProcess,
  ChildProcessByStdio,
  ChildProcessWithoutNullStreams,
  spawn,
  SpawnOptionsWithoutStdio,
} from 'child_process'
import { mkdirSync, readdirSync, unlinkSync, writeFileSync } from 'fs'
import path from 'path'
import process from 'process'

import { ToolResult } from 'common/types/agent-state'
import { buildArray } from 'common/util/array'
import { truncateStringWithMessage } from 'common/util/string'
import { red, yellow } from 'picocolors'

import { CONFIG_DIR } from './credentials'

const COMMAND_OUTPUT_LIMIT = 5000 // Limit output to 10KB per stream

const LOCK_DIR = path.join(CONFIG_DIR, 'background_processes')

export function spawnAndTrack(
  command: string,
  args: string[] = [],
  options: SpawnOptionsWithoutStdio
): ChildProcessWithoutNullStreams {
  const child = spawn(command, args, options)
  assert(child.pid !== undefined)

  mkdirSync(LOCK_DIR, { recursive: true })
  const filePath = path.join(LOCK_DIR, `${child.pid}`)
  writeFileSync(filePath, '')

  child.on('exit', () => {
    try {
      unlinkSync(filePath)
    } catch (err) {
      // do nothing
    }
  })
  return child
}

/**
 * Interface describing the information stored for each background process.
 */
export interface BackgroundProcessInfo {
  // OS-assigned Process ID
  pid: number
  toolCallId: string
  command: string
  // The actual child process object
  process: ChildProcessByStdio<any, any, any>
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
  // Path to file where stdout is being written (if specified)
  stdoutFile?: string
  // Path to file where stderr is being written (if specified)
  stderrFile?: string
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

function killAndWait(proc: ChildProcess, command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      console.warn(yellow(`Force killing process: \`${command}\``))
      proc.kill('SIGKILL')
    }, 5000)

    proc.once('exit', () => {
      clearTimeout(timeout)
      resolve()
    })

    proc.once('error', (err) => {
      clearTimeout(timeout)
      reject(err)
    })

    try {
      proc.kill('SIGTERM')
    } catch (error: any) {
      if (error.code === 'ESRCH') {
        clearTimeout(timeout)
        resolve()
      } else {
        reject(error)
      }
    }
  })
}

export async function killAllBackgroundProcesses(): Promise<void> {
  const killPromises = Array.from(backgroundProcesses.entries())
    .filter(([, p]) => p.status === 'running')
    .map(async ([pid, processInfo]) => {
      try {
        await killAndWait(processInfo.process, processInfo.command)
        console.log(yellow(`Killed process: \`${processInfo.command}\``))
      } catch (error: any) {
        if (error?.code !== 'ESRCH') {
          console.error(
            red(
              `Failed to kill: \`${processInfo.command}\` (pid ${pid}): ${error?.message || error}`
            )
          )
        }
      }
    })

  await Promise.all(killPromises)
  backgroundProcesses.clear()
}

/**
 * Cleans up stale lock files and attempts to kill orphaned processes found in the lock directory.
 * This function is intended to run on startup or periodically to handle cases where
 * the application might have exited uncleanly, leaving orphaned processes or lock files.
 */
export function cleanupStoredProcesses() {
  try {
    mkdirSync(LOCK_DIR, { recursive: true })
    const files = readdirSync(LOCK_DIR)

    for (const file of files) {
      const filePath = path.join(LOCK_DIR, file)
      const pid = parseInt(file, 10)

      if (isNaN(pid)) {
        try {
          unlinkSync(filePath)
        } catch (unlinkErr: any) {}
        continue
      }

      if (backgroundProcesses.has(pid)) {
        continue
      }

      try {
        process.kill(pid, 'SIGTERM')
        unlinkSync(filePath)
      } catch (err: any) {
        if (err.code === 'ESRCH') {
          unlinkSync(filePath)
        }
      }
    }
  } catch (error: any) {}
}
