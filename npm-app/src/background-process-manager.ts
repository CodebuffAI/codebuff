import assert from 'assert'
import {
  ChildProcessByStdio,
  ChildProcessWithoutNullStreams,
  spawn,
  SpawnOptionsWithoutStdio,
} from 'child_process'
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import path from 'path'
import process from 'process'

import { AnalyticsEvent } from 'common/constants/analytics-events'
import { ToolResult } from 'common/types/agent-state'
import { buildArray } from 'common/util/array'
import { truncateStringWithMessage } from 'common/util/string'
import { gray, red } from 'picocolors'
import { z } from 'zod'

import { CONFIG_DIR } from './credentials'
import { logger } from './utils/logger'

const COMMAND_OUTPUT_LIMIT = 5000 // Limit output to 10KB per stream
const COMMAND_KILL_TIMEOUT_MS = 5000
const POLLING_INTERVAL_MS = 200

const LOCK_DIR = path.join(CONFIG_DIR, 'background_processes')

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

  // Only report finished processes if there are changes
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
    `<process_id>${info.pid}</process_id>`,
    `<command>${info.command}</command>`,
    `<start_time_utc>${new Date(info.startTime).toISOString()}</start_time_utc>`,
    `<duration_ms>${duration}</duration_ms>`,
    newStdout &&
      `<stdout>${truncateStringWithMessage({
        str: getOutputWithContext(newStdout, info.lastReportedStdoutLength),
        maxLength: COMMAND_OUTPUT_LIMIT,
        remove: 'START',
      })}</stdout>`,
    newStderr &&
      `<stderr>${truncateStringWithMessage({
        str: getOutputWithContext(newStderr, info.lastReportedStderrLength),
        maxLength: COMMAND_OUTPUT_LIMIT,
        remove: 'START',
      })}</stderr>`,
    `<status>${info.status}</status>`,
    info.process.exitCode !== null &&
      `<exit_code>${info.process.exitCode}</exit_code>`,
    info.process.signalCode &&
      `<signal_code>${info.process.signalCode}</signal_code>`,
    '</background_process>'
  ).join('\n')
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
      toolCallId,
      toolName: 'background_process_updates',
      result: update,
    }
  })
}

function deleteFileIfExists(fileName: string) {
  try {
    unlinkSync(fileName)
  } catch {}
}

const zodMaybeNumber = z.preprocess((val) => {
  const n = Number(val)
  return typeof val === 'undefined' || isNaN(n) ? undefined : n
}, z.number().optional())

const lockFileSchema = z.object({
  parentPid: zodMaybeNumber,
})

type LockFileSchema = z.infer<typeof lockFileSchema>

/**
 * Creates a lock file for a background process with the current process's PID.
 * This allows tracking parent-child process relationships for cleanup.
 *
 * @param filePath - Path where the lock file should be created
 */
function createLockFile(filePath: string): void {
  const data: LockFileSchema = {
    parentPid: process.pid,
  }

  writeFileSync(filePath, JSON.stringify(data, null, 1))
}

/**
 * Checks if a process with the given PID is still running.
 *
 * @param pid - Process ID to check
 * @returns true if the process is running, false otherwise
 */
function isRunning(pid: number) {
  try {
    process.kill(pid, 0)
  } catch (error: any) {
    if (error.code === 'ESRCH') {
      return false
    }
  }

  return true
}

/**
 * Determines whether the process associated with a given PID should be
 * terminated, based on the lock file contents stored for that PID.
 *
 * If the parent process is no longer active or the file is invalid, the
 * function assumes the process is orphaned and should be killed.
 *
 * @param lockFile - The path of the lock file.
 * @returns `true` if the process should be killed (e.g. parent no longer exists or file is invalid),
 *          `false` if the parent process is still alive and the process should be kept running.
 */
function shouldKillProcessUsingLock(lockFile: string): boolean {
  const fileContents = String(readFileSync(lockFile))

  let data: LockFileSchema
  try {
    data = lockFileSchema.parse(JSON.parse(fileContents))
  } catch (error) {
    data = {
      parentPid: undefined,
    }
  }

  if (data.parentPid && isRunning(data.parentPid)) {
    return false
  }

  return true
}

export function spawnAndTrack(
  command: string,
  args: string[] = [],
  options: SpawnOptionsWithoutStdio
): ChildProcessWithoutNullStreams {
  const child = spawn(command, args, {
    ...options,
    detached: true,
  })
  assert(child.pid !== undefined)
  logger.info(
    {
      eventId: AnalyticsEvent.BACKGROUND_PROCESS_START,
      pid: child.pid,
    },
    `Process start: \`${command} ${args.join(' ')}\``
  )

  mkdirSync(LOCK_DIR, { recursive: true })
  const filePath = path.join(LOCK_DIR, `${child.pid}`)
  createLockFile(filePath)

  child.on('exit', () => {
    deleteFileIfExists(filePath)
    logger.info(
      { eventId: AnalyticsEvent.BACKGROUND_PROCESS_END, pid: child.pid },
      `Graceful exit: \`${command} ${args.join(' ')}\``
    )
  })
  return child
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

function waitForProcessExit(pid: number): Promise<boolean> {
  return new Promise((resolve) => {
    let resolved = false

    const interval = setInterval(() => {
      if (!isRunning(pid)) {
        clearInterval(interval)
        clearTimeout(timeout)
        resolved = true
        resolve(true)
      }
    }, POLLING_INTERVAL_MS)

    const timeout = setTimeout(() => {
      if (!resolved) {
        clearInterval(interval)
        resolve(false)
      }
    }, COMMAND_KILL_TIMEOUT_MS)
  })
}

function killProcessTreeSoftly(pid: number): void {
  if (process.platform === 'win32') {
    // /T = kill tree, no /F = soft kill
    spawn('taskkill', ['/PID', String(pid), '/T'], {
      stdio: 'ignore',
      detached: true,
    }).unref()
  } else {
    try {
      process.kill(-pid, 'SIGTERM')
    } catch (err) {
      if ((err as any)?.code !== 'ESRCH') throw err
    }
  }
}

async function killAndWait(pid: number): Promise<void> {
  try {
    killProcessTreeSoftly(pid)
    if (await waitForProcessExit(pid)) {
      return
    }
  } catch (error: any) {
    if (error.code === 'ESRCH') {
      return
    } else {
      throw error
    }
  }
  throw new Error(`Unable to kill process ${pid}`)
}

// Only to be run on exit
export function sendKillSignalToAllBackgroundProcesses(): void {
  for (const [pid, p] of backgroundProcesses.entries()) {
    if (p.status !== 'running') {
      continue
    }

    try {
      killProcessTreeSoftly(pid)
    } catch {}
  }
}

export async function killAllBackgroundProcesses(): Promise<void> {
  const killPromises = Array.from(backgroundProcesses.entries())
    .filter(([, p]) => p.status === 'running')
    .map(async ([pid, processInfo]) => {
      try {
        await killAndWait(pid)
        // console.log(gray(`Killed process: \`${processInfo.command}\``))
      } catch (error: any) {
        console.error(
          red(
            `Failed to kill: \`${processInfo.command}\` (pid ${pid}): ${error?.message || error}`
          )
        )
        logger.error(
          {
            errorMessage: error?.message || String(error),
            pid,
            command: processInfo.command,
          },
          'Failed to kill process'
        )
      }
    })

  await Promise.all(killPromises)
  backgroundProcesses.clear()
}

/**
 * Cleans up stale lock files and attempts to kill orphaned processes found in the lock directory.
 * This function is intended to run on startup to handle cases where the application might have
 * exited uncleanly, leaving orphaned processes or lock files.
 *
 * @returns Object containing:
 *   - shouldStartNewProcesses: boolean indicating if it's safe to start new processes
 *   - cleanUpPromise: Promise that resolves when cleanup is complete
 */
export function cleanupStoredProcesses(): {
  separateCodebuffInstanceRunning: boolean
  cleanUpPromise: Promise<any>
} {
  // Determine which processes to kill (sync)
  let separateCodebuffInstanceRunning = false
  const locksToProcess: string[] = []
  try {
    mkdirSync(LOCK_DIR, { recursive: true })
    const files = readdirSync(LOCK_DIR)

    for (const file of files) {
      const lockFile = path.join(LOCK_DIR, file)
      if (shouldKillProcessUsingLock(lockFile)) {
        locksToProcess.push(file)
      } else {
        separateCodebuffInstanceRunning = true
      }
    }
  } catch {}

  if (locksToProcess.length) {
    console.log(gray('Detected running codebuff processes. Cleaning...\n'))
    logger.info({
      eventId: AnalyticsEvent.BACKGROUND_PROCESS_LEFTOVER_DETECTED,
      pids: locksToProcess,
    })
  }

  // Actually kill processes (async)
  const processLockFile = async (pidName: string) => {
    const lockFile = path.join(LOCK_DIR, pidName)

    const pid = parseInt(pidName, 10)
    if (isNaN(pid)) {
      deleteFileIfExists(lockFile)
      logger.info(
        { eventId: AnalyticsEvent.BACKGROUND_PROCESS_END, pid },
        'Lock found but process not running.'
      )
      return
    }

    if (backgroundProcesses.has(pid)) {
      logger.error(
        { eventId: AnalyticsEvent.BACKGROUND_PROCESS_END, pid },
        'Process running in current session. Should not occur.'
      )
      return
    }

    try {
      killProcessTreeSoftly(pid)
      if (await waitForProcessExit(pid)) {
        deleteFileIfExists(lockFile)
        logger.info(
          { eventId: AnalyticsEvent.BACKGROUND_PROCESS_END, pid },
          'Process successfully killed.'
        )
      } else {
        logger.warn(
          { eventId: AnalyticsEvent.BACKGROUND_PROCESS_CONTINUE, pid },
          'Process unable to be killed. Leaving lock file.'
        )
      }
    } catch (err: any) {
      if (err.code === 'ESRCH') {
        deleteFileIfExists(lockFile)
        logger.info(
          { eventId: AnalyticsEvent.BACKGROUND_PROCESS_END, pid },
          'Leftover process (with lock) died naturally.'
        )
      } else {
        logger.error(
          { eventId: AnalyticsEvent.BACKGROUND_PROCESS_CONTINUE, err, pid },
          'Error killing process'
        )
      }
    }
  }

  const cleanUpPromise = Promise.all(locksToProcess.map(processLockFile))

  return {
    separateCodebuffInstanceRunning,
    cleanUpPromise,
  }
}
