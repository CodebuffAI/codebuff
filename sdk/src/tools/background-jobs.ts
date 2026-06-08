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
  status: BackgroundJobStatus
  exitCode: number | null
  startedAt: number
  /** Bytes of the log file already returned by check_job. */
  readOffset: number
}

const jobs = new Map<string, BackgroundJob>()
let jobCounter = 0

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
  child.on('exit', (code) => {
    job.status = code === 0 ? 'completed' : 'error'
    job.exitCode = code
    closeLog()
  })
  child.on('error', () => {
    job.status = 'error'
    closeLog()
  })

  jobs.set(jobId, job)
  return job
}

export function getBackgroundJob(jobId: string): BackgroundJob | undefined {
  return jobs.get(jobId)
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
