import { spawn, type ChildProcess } from 'child_process'
import { randomBytes } from 'crypto'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { StringDecoder } from 'string_decoder'

import {
  __clearPendingBackgroundJobsForTest,
  removePendingBackgroundJob,
  upsertPendingBackgroundJob,
} from '@codebuff/common/util/pending-background-jobs'

/**
 * In-memory registry of background processes started via
 * run_terminal_command(process_type: 'BACKGROUND'). The SDK runs inside the
 * long-lived client process (e.g. the CLI), so this Map persists across tool
 * calls within a session and lets check_job poll/follow a job's output.
 *
 * Each job streams stdout+stderr to a temp log file; check_job reads the new
 * bytes since the last check (tracked by readOffset) so output is never
 * duplicated or lost between polls.
 */
export type BackgroundJobStatus = 'running' | 'completed' | 'error' | 'lost'

export interface BackgroundJobOwner {
  clientSessionId: string
  rootRunId: string
  parentRunId: string
  parentAgentId: string
}

export function isProcessTreeAlive(child: Pick<ChildProcess, 'pid'>): boolean {
  if (!child.pid) return false
  try {
    process.kill(os.platform() === 'win32' ? child.pid : -child.pid, 0)
    return true
  } catch {
    return false
  }
}

export function terminateProcessTree(
  child: Pick<ChildProcess, 'pid' | 'kill'>,
  signal: 'SIGTERM' | 'SIGKILL',
): boolean {
  if (!child.pid) return false
  if (os.platform() !== 'win32') {
    try {
      process.kill(-child.pid, signal)
      return true
    } catch {
      // Fall back to the direct child when process-group signaling is not
      // available (for example, recovered legacy jobs).
    }
  }
  try {
    return child.kill(signal)
  } catch {
    return false
  }
}

export interface BackgroundJob {
  jobId: string
  command: string
  child: ChildProcess
  logFile: string
  metadataFile: string
  status: BackgroundJobStatus
  exitCode: number | null
  startedAt: number
  /** Bytes of the log file already returned by check_job. */
  readOffset: number
  /** Preserves incomplete UTF-8 sequences across bounded incremental reads. */
  decoder?: StringDecoder
  owner?: BackgroundJobOwner
}

const jobs = new Map<string, BackgroundJob>()
const metadataFilesCreatedByThisProcess = new Set<string>()
let jobCounter = 0

/**
 * Max age of orphaned background-job log/metadata files in /tmp before they
 * are eligible for cleanup on the next startBackgroundJob call. Set to 24h to
 * preserve recently-completed jobs for short-lived recovery while preventing
 * unbounded accumulation across CLI sessions.
 */
const ORPHANED_JOB_FILE_MAX_AGE_MS = 24 * 60 * 60 * 1000
const MAX_BACKGROUND_LOG_BYTES = 10 * 1024 * 1024
const MAX_BACKGROUND_READ_BYTES = 100_000
const BACKGROUND_LOG_MONITOR_INTERVAL_MS = 250
const JOB_ID_PATTERN = /^job-[A-Za-z0-9_-]+$/
/**
 * Permissions for newly-created background job temp files. 0o600 keeps the
 * log/metadata readable only by the owning user, since they may contain
 * sensitive command output.
 */
const JOB_FILE_MODE = 0o600
/**
 * `O_NOFOLLOW` causes open() to fail with ELOOP when the final path component
 * is a symlink. On Windows it is not defined; fall back to 0 (no-op) since
 * symlink semantics differ there and the temp dir is not world-writable.
 */
const O_NOFOLLOW_FLAG =
  typeof fs.constants.O_NOFOLLOW === 'number' ? fs.constants.O_NOFOLLOW : 0
let orphanedJobFilesSwept = false

/**
 * Create a background-job log file for appending without following symlinks
 * or reusing an existing path. `O_EXCL` rejects both pre-created regular files
 * and symlinks, preventing temp-file clobbering despite the shared temp dir.
 */
function safeCreateJobLogFile(logFile: string): number {
  return fs.openSync(
    logFile,
    fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      fs.constants.O_APPEND |
      O_NOFOLLOW_FLAG,
    JOB_FILE_MODE,
  )
}

/**
 * Provide a clear early error for pre-existing symlinks. The open() calls also
 * use O_NOFOLLOW so a symlink swapped in after this check is still rejected.
 */
function rejectIfSymlink(candidate: string): void {
  let stat: fs.Stats
  try {
    stat = fs.lstatSync(candidate)
  } catch {
    return
  }
  if (stat.isSymbolicLink()) {
    throw new Error(
      `Refusing to start background job: temp file "${candidate}" is a symlink.`,
    )
  }
}

/**
 * Write background-job metadata without following symlinks. The first write
 * creates the file exclusively; later writes may truncate only a metadata path
 * created by this process.
 */
function safeWriteJobMetadata(
  metadataFile: string,
  metadata: BackgroundJobMetadata,
): void {
  const firstWrite = !metadataFilesCreatedByThisProcess.has(metadataFile)
  const flags = firstWrite
    ? fs.constants.O_CREAT |
      fs.constants.O_EXCL |
      fs.constants.O_WRONLY |
      O_NOFOLLOW_FLAG
    : fs.constants.O_WRONLY | fs.constants.O_TRUNC | O_NOFOLLOW_FLAG

  const fd = fs.openSync(metadataFile, flags, JOB_FILE_MODE)
  try {
    fs.writeSync(fd, JSON.stringify(metadata, null, 2))
    metadataFilesCreatedByThisProcess.add(metadataFile)
  } finally {
    fs.closeSync(fd)
  }
}

export function safeOpenJobLogForRead(
  logFile: string,
): { fd: number; size: number } | { errorMessage: string } {
  try {
    const lstat = fs.lstatSync(logFile)
    if (!lstat.isFile()) {
      return { errorMessage: `Path is not a regular file: ${logFile}` }
    }

    const fd = fs.openSync(logFile, fs.constants.O_RDONLY | O_NOFOLLOW_FLAG)
    try {
      const stat = fs.fstatSync(fd)
      if (!stat.isFile()) {
        fs.closeSync(fd)
        return { errorMessage: `Path is not a regular file: ${logFile}` }
      }
      return { fd, size: stat.size }
    } catch (error) {
      fs.closeSync(fd)
      return {
        errorMessage: `Could not inspect log file: ${(error as Error).message}`,
      }
    }
  } catch (error) {
    return {
      errorMessage: `Could not open log file safely: ${(error as Error).message}`,
    }
  }
}

function safeReadJobMetadataFile(metadataFile: string): string | undefined {
  let fd: number | undefined
  try {
    const lstat = fs.lstatSync(metadataFile)
    if (!lstat.isFile()) return undefined

    fd = fs.openSync(metadataFile, fs.constants.O_RDONLY | O_NOFOLLOW_FLAG)
    const stat = fs.fstatSync(fd)
    if (!stat.isFile()) return undefined

    return fs.readFileSync(fd, 'utf8')
  } catch {
    return undefined
  } finally {
    if (fd !== undefined) {
      try {
        fs.closeSync(fd)
      } catch {
        // already closed
      }
    }
  }
}

/**
 * Best-effort cleanup of stale `openbuff-job-*.{log,json}` files left in the
 * OS temp dir by previous CLI sessions. Runs once per process, lazily on the
 * first background-job spawn, and never throws.
 */
function sweepOrphanedJobFiles(): void {
  if (orphanedJobFilesSwept) return
  orphanedJobFilesSwept = true
  sweepOrphanedJobFilesForTest()
}

function shouldPreserveJobMetadata(metadataFile: string): boolean {
  try {
    const rawMetadata = safeReadJobMetadataFile(metadataFile)
    if (rawMetadata === undefined) return false
    const metadata = JSON.parse(rawMetadata) as Partial<BackgroundJobMetadata>
    if (metadata.status !== 'running') return false
    if (metadata.processId === null || metadata.processId === undefined) {
      // Be conservative when we cannot verify liveness.
      return true
    }
    return isProcessAlive(metadata.processId)
  } catch {
    return false
  }
}

function removeFileIfPresent(filePath: string): void {
  try {
    fs.unlinkSync(filePath)
  } catch {
    // file vanished or permission denied — skip
  }
}

function sweepOrphanedJobFilesForTest(): void {
  try {
    const tmpDir = os.tmpdir()
    const entries = fs.readdirSync(tmpDir)
    const now = Date.now()
    for (const entry of entries) {
      if (!entry.startsWith('openbuff-job-')) continue
      if (!entry.endsWith('.log') && !entry.endsWith('.json')) continue
      const fullPath = path.join(tmpDir, entry)
      try {
        const stat = fs.lstatSync(fullPath)
        if (now - stat.mtimeMs <= ORPHANED_JOB_FILE_MAX_AGE_MS) continue

        const metadataFile = entry.endsWith('.json')
          ? fullPath
          : fullPath.replace(/\.log$/, '.json')
        if (
          fs.existsSync(metadataFile) &&
          shouldPreserveJobMetadata(metadataFile)
        ) {
          continue
        }

        removeFileIfPresent(fullPath)
        if (entry.endsWith('.json')) {
          removeFileIfPresent(fullPath.replace(/\.json$/, '.log'))
        }
      } catch {
        // file vanished or permission denied — skip
      }
    }
  } catch {
    // tmpdir unreadable — give up silently
  }
}

type BackgroundJobMetadata = {
  jobId: string
  command: string
  processId: number | null
  logFile: string
  status: BackgroundJobStatus
  exitCode: number | null
  startedAt: number
  readOffset?: number
  owner?: BackgroundJobOwner
}

function writeBackgroundJobMetadata(job: BackgroundJob): void {
  const metadata: BackgroundJobMetadata = {
    jobId: job.jobId,
    command: job.command,
    processId: job.child.pid ?? null,
    logFile: job.logFile,
    status: job.status,
    exitCode: job.exitCode,
    startedAt: job.startedAt,
    readOffset: job.readOffset,
    owner: job.owner,
  }
  try {
    safeWriteJobMetadata(job.metadataFile, metadata)
  } catch {
    // best-effort recovery metadata
  }
}

function nextJobId(): string {
  jobCounter += 1
  return `job-${process.pid}-${jobCounter}-${randomBytes(8).toString('hex')}`
}

function getBackgroundJobFilePath(
  jobId: string,
  extension: 'log' | 'json',
): string | undefined {
  if (!JOB_ID_PATTERN.test(jobId)) {
    return undefined
  }
  return path.join(os.tmpdir(), `openbuff-${jobId}.${extension}`)
}

function isUsableRecoveredLogFile(logFile: string): boolean {
  try {
    return fs.lstatSync(logFile).isFile()
  } catch {
    return false
  }
}

/**
 * Spawn a detached-from-the-step background process whose combined output is
 * appended to a temp log file. Returns immediately; the agent observes
 * progress via check_job.
 */
export function startBackgroundJob(params: {
  command: string
  shell: string
  shellArgs: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  owner?: BackgroundJob['owner']
}): BackgroundJob {
  const { command, shell, shellArgs, cwd, env } = params
  const owner = params.owner ?? {
    clientSessionId: 'unknown-session',
    rootRunId: 'unknown-root',
    parentRunId: 'unknown-parent',
    parentAgentId: 'unknown-agent',
  }
  sweepOrphanedJobFiles()
  const jobId = nextJobId()
  const logFile = getBackgroundJobFilePath(jobId, 'log')!
  const metadataFile = getBackgroundJobFilePath(jobId, 'json')!
  // Reject pre-existing symlinks at both paths before opening for write.
  // safeCreateJobLogFile/safeWriteJobMetadata also use O_EXCL + O_NOFOLLOW so
  // pre-created regular files and TOCTOU symlink swaps are rejected at open().
  rejectIfSymlink(logFile)
  rejectIfSymlink(metadataFile)
  const outFd = safeCreateJobLogFile(logFile)

  const child = spawn(shell, [...shellArgs, command], {
    cwd,
    env,
    stdio: ['ignore', outFd, outFd],
    detached: os.platform() !== 'win32',
  })

  const job: BackgroundJob = {
    jobId,
    command,
    child,
    logFile,
    metadataFile,
    status: 'running',
    exitCode: null,
    startedAt: Date.now(),
    readOffset: 0,
    decoder: new StringDecoder('utf8'),
    owner,
  }

  upsertPendingBackgroundJob({
    jobId,
    command,
    status: job.status,
    startedAt: job.startedAt,
    owner,
  })

  let quotaExceeded = false
  const logQuotaTimer = setInterval(() => {
    try {
      const size = fs.statSync(logFile).size
      if (size <= MAX_BACKGROUND_LOG_BYTES) return
      if (!quotaExceeded) {
        quotaExceeded = true
        job.status = 'error'
        terminateProcessTree(child, 'SIGTERM')
        writeBackgroundJobMetadata(job)
      }
      // Keep trimming while the process is unwinding so a chatty child cannot
      // regrow a sparse/oversized log between SIGTERM and exit.
      fs.truncateSync(logFile, MAX_BACKGROUND_LOG_BYTES)
    } catch {
      // The process exit/error handlers own final cleanup.
    }
  }, BACKGROUND_LOG_MONITOR_INTERVAL_MS)
  logQuotaTimer.unref?.()

  const closeLog = () => {
    clearInterval(logQuotaTimer)
    try {
      fs.closeSync(outFd)
    } catch {
      // already closed
    }
  }
  const writeMetadata = () => writeBackgroundJobMetadata(job)
  writeMetadata()
  child.on('exit', (code) => {
    job.status = quotaExceeded ? 'error' : code === 0 ? 'completed' : 'error'
    job.exitCode = code
    if (quotaExceeded) {
      try {
        fs.truncateSync(logFile, MAX_BACKGROUND_LOG_BYTES)
      } catch {}
    }
    writeMetadata()
    closeLog()
    removePendingBackgroundJob(jobId)
  })
  child.on('error', () => {
    job.status = 'error'
    writeMetadata()
    closeLog()
    removePendingBackgroundJob(jobId)
  })

  jobs.set(jobId, job)
  return job
}

export function getBackgroundJob(jobId: string): BackgroundJob | undefined {
  const existing = jobs.get(jobId)
  if (existing) return existing

  const recovered = recoverBackgroundJob(jobId)
  if (recovered) {
    jobs.set(jobId, recovered)
    if (recovered.status === 'running') {
      upsertPendingBackgroundJob({
        jobId: recovered.jobId,
        command: recovered.command,
        status: recovered.status,
        startedAt: recovered.startedAt,
        owner: recovered.owner,
      })
    }
  }
  return recovered
}

function recoverBackgroundJob(jobId: string): BackgroundJob | undefined {
  const metadataFile = getBackgroundJobFilePath(jobId, 'json')
  const fallbackLogFile = getBackgroundJobFilePath(jobId, 'log')
  if (!metadataFile || !fallbackLogFile) {
    return undefined
  }

  try {
    const rawMetadata = safeReadJobMetadataFile(metadataFile)
    if (rawMetadata === undefined) return undefined
    const metadata = JSON.parse(rawMetadata) as BackgroundJobMetadata
    if (
      metadata.jobId !== jobId ||
      metadata.logFile !== fallbackLogFile ||
      !isUsableRecoveredLogFile(fallbackLogFile)
    ) {
      return undefined
    }

    const status =
      metadata.status === 'running' &&
      (metadata.processId === null || !isProcessAlive(metadata.processId))
        ? 'lost'
        : metadata.status
    const logSize = fs.statSync(fallbackLogFile).size
    const readOffset =
      typeof metadata.readOffset === 'number' &&
      Number.isFinite(metadata.readOffset)
        ? Math.min(Math.max(0, Math.floor(metadata.readOffset)), logSize)
        : 0
    const owner = isBackgroundJobOwner(metadata.owner)
      ? metadata.owner
      : undefined

    metadataFilesCreatedByThisProcess.add(metadataFile)

    return {
      jobId,
      command: metadata.command,
      child: { pid: metadata.processId ?? undefined } as ChildProcess,
      logFile: fallbackLogFile,
      metadataFile,
      status,
      exitCode: metadata.exitCode,
      startedAt: metadata.startedAt,
      readOffset,
      decoder: new StringDecoder('utf8'),
      owner,
    }
  } catch {
    return undefined
  }
}

function isBackgroundJobOwner(value: unknown): value is BackgroundJobOwner {
  if (!value || typeof value !== 'object') return false
  const candidate = value as Partial<BackgroundJobOwner>
  return (
    typeof candidate.clientSessionId === 'string' &&
    typeof candidate.rootRunId === 'string' &&
    typeof candidate.parentRunId === 'string' &&
    typeof candidate.parentAgentId === 'string'
  )
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ESRCH'
    ) {
      return false
    }
    return true
  }
}

function killProcess(pid: number, signal: 'SIGTERM' | 'SIGKILL'): boolean {
  try {
    process.kill(pid, signal)
    return true
  } catch {
    return false
  }
}

export function killBackgroundJob(
  jobId: string,
  signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM',
):
  | {
      jobId: string
      status: BackgroundJobStatus
      killed: boolean
      signal: 'SIGTERM' | 'SIGKILL'
      exitCode?: number | null
    }
  | { jobId: string; errorMessage: string } {
  const job = getBackgroundJob(jobId)
  if (!job) {
    return {
      jobId,
      errorMessage: `No background job found with id "${jobId}".`,
    }
  }

  if (job.status !== 'running') {
    return {
      jobId,
      status: job.status,
      killed: false,
      signal,
      exitCode: job.exitCode,
    }
  }

  const pid = job.child.pid
  if (!pid) {
    job.status = 'error'
    return {
      jobId,
      errorMessage: `Background job "${jobId}" has no process id to kill.`,
    }
  }

  const killed =
    typeof job.child.kill === 'function'
      ? terminateProcessTree(job.child, signal)
      : killProcess(os.platform() === 'win32' ? pid : -pid, signal)
  if (killed) {
    job.status = 'error'
    removePendingBackgroundJob(jobId)
  }

  return {
    jobId,
    status: job.status,
    killed,
    signal,
    exitCode: job.exitCode,
  }
}

/**
 * Return the log bytes written since the last call for this job, advancing the
 * job's read offset. Returns '' when there is nothing new (or the log is not
 * yet readable). Never throws.
 */
export function readNewJobOutput(job: BackgroundJob): string {
  const opened = safeOpenJobLogForRead(job.logFile)
  if ('errorMessage' in opened) return ''
  const { fd, size } = opened
  try {
    if (size <= job.readOffset) {
      if (job.status !== 'running' && job.decoder) {
        const final = job.decoder.end()
        job.decoder = new StringDecoder('utf8')
        return final
      }
      return ''
    }
    const length = Math.min(size - job.readOffset, MAX_BACKGROUND_READ_BYTES)
    const buf = Buffer.alloc(length)
    const bytesRead = fs.readSync(fd, buf, 0, length, job.readOffset)
    job.readOffset += bytesRead
    if (bytesRead > 0) {
      writeBackgroundJobMetadata(job)
    }
    job.decoder ??= new StringDecoder('utf8')
    return job.decoder.write(buf.subarray(0, bytesRead))
  } catch {
    return ''
  } finally {
    fs.closeSync(fd)
  }
}

/** Test-only: register a job backed by an existing log file (no real process). */
export function __registerJobForTest(job: BackgroundJob): void {
  jobs.set(job.jobId, job)
}

/** Test-only: clear the registry between tests. */
export function __clearJobsForTest(): void {
  jobs.clear()
  metadataFilesCreatedByThisProcess.clear()
  orphanedJobFilesSwept = false
  __clearPendingBackgroundJobsForTest()
}

/** Test-only: run stale background-job temp-file cleanup deterministically. */
export function __sweepOrphanedJobFilesForTest(): void {
  sweepOrphanedJobFilesForTest()
}
