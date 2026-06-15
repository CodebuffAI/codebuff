import { getBackgroundJob, readNewJobOutput } from './background-jobs'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const CHECK_JOB_OUTPUT_LIMIT = 50_000
const POLL_INTERVAL_MS = 200

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function truncateEnd(value: string, max: number): string {
  return value.length > max
    ? value.slice(0, max) + `\n…[truncated ${value.length - max} chars]`
    : value
}

/**
 * Poll or follow a background job started by run_terminal_command. With no
 * wait_for/timeout this returns immediately with whatever output has arrived
 * since the last check (poll mode). With wait_for and/or timeout_seconds it
 * blocks — bounded by the timeout — until the pattern appears in new output or
 * the job exits (follow mode). To watch an arbitrary log file, start a
 * `tail -f <file>` background job and check_job it with a wait_for pattern.
 */
export async function checkJob(params: {
  jobId: string
  wait_for?: string
  timeout_seconds?: number
}): Promise<CodebuffToolOutput<'check_job'>> {
  const { jobId, wait_for: waitFor } = params
  const timeoutMs = Math.max(0, (params.timeout_seconds ?? 0) * 1000)

  const job = getBackgroundJob(jobId)
  if (!job) {
    return [
      {
        type: 'json',
        value: {
          jobId,
          errorMessage: `No background job found with id "${jobId}". The job metadata/log file may have been cleaned up, or the job was started before recoverable background metadata was written.`,
        },
      },
    ]
  }

  const deadline = Date.now() + timeoutMs
  let collected = ''
  while (true) {
    collected += readNewJobOutput(job)
    const matched = waitFor ? collected.includes(waitFor) : true
    const finished = job.status !== 'running'
    if (matched || finished || Date.now() >= deadline) {
      return [
        {
          type: 'json',
          value: {
            jobId,
            status: job.status,
            newOutput: truncateEnd(collected, CHECK_JOB_OUTPUT_LIMIT),
            ...(job.exitCode !== null ? { exitCode: job.exitCode } : {}),
            ...(waitFor ? { matched } : {}),
          },
        },
      ]
    }
    await sleep(POLL_INTERVAL_MS)
  }
}
