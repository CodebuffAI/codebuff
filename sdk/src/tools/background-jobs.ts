import { spawn, type ChildProcess } from 'child_process'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

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
export type BackgroundJobStatus = 'running' | 'completed' | 'error'

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
}

const jobs = new Map<string, BackgroundJob>()
let jobCounter = 0

type BackgroundJobMetadata = {
  jobId: string
  command: string
  processId: number | null
  logFile: string
  status: BackgroundJobStatus
  exitCode: number | null
  startedAt: number
}

function nextJobId(): string {
  jobCounter += 1
  return `job-${process.pid}-${jobCounter}`
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
}): BackgroundJob {
  const { command, shell, shellArgs, cwd, env } = params
  const jobId = nextJobId()
  const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
  const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
  const outFd = fs.openSync(logFile, 'a')

  const child = spawn(shell, [...shellArgs, command], {
    cwd,
    env,
    stdio: ['ignore', outFd, outFd],
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
  }

  const closeLog = () => {
    try {
      fs.closeSync(outFd)
    } catch {
      // already closed
    }
  }
  const writeMetadata = () => {
    const metadata: BackgroundJobMetadata = {
      jobId,
      command,
      processId: child.pid ?? null,
      logFile,
      status: job.status,
      exitCode: job.exitCode,
      startedAt: job.startedAt,
    }
    try {
      fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, 2))
    } catch {
      // best-effort recovery metadata
    }
  }
  writeMetadata()
  child.on('exit', (code) => {
    job.status = code === 0 ? 'completed' : 'error'
    job.exitCode = code
    writeMetadata()
    closeLog()
  })
  child.on('error', () => {
    job.status = 'error'
    writeMetadata()
    closeLog()
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
  }
  return recovered
}

function recoverBackgroundJob(jobId: string): BackgroundJob | undefined {
  const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
  const fallbackLogFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
  try {
    const metadata = JSON.parse(
      fs.readFileSync(metadataFile, 'utf8'),
    ) as BackgroundJobMetadata
    const status =
      metadata.status === 'running' &&
      metadata.processId !== null &&
      !isProcessAlive(metadata.processId)
        ? 'completed'
        : metadata.status

    return {
      jobId: metadata.jobId,
      command: metadata.command,
      child: { pid: metadata.processId ?? undefined } as ChildProcess,
      logFile: metadata.logFile,
      metadataFile,
      status,
      exitCode: metadata.exitCode,
      startedAt: metadata.startedAt,
      readOffset: 0,
    }
  } catch {
    if (!fs.existsSync(fallbackLogFile)) {
      return undefined
    }
    return {
      jobId,
      command: '',
      child: { pid: undefined } as ChildProcess,
      logFile: fallbackLogFile,
      metadataFile,
      status: 'running',
      exitCode: null,
      startedAt: 0,
      readOffset: 0,
    }
  }
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
      ? job.child.kill(signal)
      : killProcess(pid, signal)
  if (killed) {
    job.status = 'error'
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
  try {
    const stat = fs.statSync(job.logFile)
    if (stat.size <= job.readOffset) return ''
    const length = stat.size - job.readOffset
    const fd = fs.openSync(job.logFile, 'r')
    try {
      const buf = Buffer.alloc(length)
      const bytesRead = fs.readSync(fd, buf, 0, length, job.readOffset)
      job.readOffset += bytesRead
      return buf.toString('utf8', 0, bytesRead)
    } finally {
      fs.closeSync(fd)
    }
  } catch {
    return ''
  }
}

/** Test-only: register a job backed by an existing log file (no real process). */
export function __registerJobForTest(job: BackgroundJob): void {
  jobs.set(job.jobId, job)
}

/** Test-only: clear the registry between tests. */
export function __clearJobsForTest(): void {
  jobs.clear()
}
