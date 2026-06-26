import {
  getBackgroundJob,
  killBackgroundJob,
  readNewJobOutput,
} from './background-jobs'

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
  kill_on_timeout?: boolean
}): Promise<CodebuffToolOutput<'check_job'>> {
  const { jobId, wait_for: waitFor } = params
  const timeoutMs = Math.max(0, (params.timeout_seconds ?? 0) * 1000)
  // Default to killing the job when the follow-timeout fires. Poll mode
  // (timeoutMs === 0) never kills — only the follow-timeout branch below can.
  const killOnTimeout = params.kill_on_timeout ?? true

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
  // Cap accumulation during polling so a long-running chatty job can't OOM
  // the agent runtime before the follow timeout fires. Keep head + tail with
  // a marker; the final return still applies CHECK_JOB_OUTPUT_LIMIT on top.
  const COLLECTED_CAP = CHECK_JOB_OUTPUT_LIMIT * 2
  const COLLECTED_TAIL_KEEP = Math.floor(CHECK_JOB_OUTPUT_LIMIT / 4)
  while (true) {
    const chunk = readNewJobOutput(job)
    if (collected.length + chunk.length > COLLECTED_CAP) {
      const head = collected.slice(0, COLLECTED_CAP - COLLECTED_TAIL_KEEP)
      const overflow =
        collected.length + chunk.length - COLLECTED_CAP
      const tail = (collected + chunk).slice(
        (collected + chunk).length - COLLECTED_TAIL_KEEP,
      )
      collected =
        head +
        `\n…[poll truncated ${overflow} chars mid-stream]\n` +
        tail
    } else {
      collected += chunk
    }
    const matched = waitFor ? collected.includes(waitFor) : true
    const finished = job.status !== 'running'
    if (matched || finished || Date.now() >= deadline) {
      // The follow-timeout fired (deadline reached, pattern NOT matched, job
      // NOT finished, and still running) and only in follow mode (timeoutMs > 0).
      // Poll mode (timeoutMs === 0) must never kill even though its deadline
      // is immediately reached, because `matched`/`finished` would also be true
      // there — but guard with timeoutMs > 0 to be explicit and safe.
      const timedOut =
        timeoutMs > 0 && !matched && !finished && Date.now() >= deadline
      if (timedOut && job.status === 'running' && killOnTimeout) {
        const killResult = killBackgroundJob(jobId, 'SIGTERM')
        if ('killed' in killResult) {
          // killBackgroundJob updates the in-memory job status; prefer the
          // fresh kill-result status/exitCode over the stale local `job` ref.
          return [
            {
              type: 'json',
              value: {
                jobId,
                status: killResult.status,
                newOutput: truncateEnd(collected, CHECK_JOB_OUTPUT_LIMIT),
                ...(killResult.exitCode !== undefined &&
                killResult.exitCode !== null
                  ? { exitCode: killResult.exitCode }
                  : {}),
                ...(waitFor ? { matched } : {}),
                killed: true,
              },
            },
          ]
        }
        // Kill itself reported an error (e.g. no pid): surface it while still
        // marking the attempt so the caller knows a kill was attempted.
        return [
          {
            type: 'json',
            value: {
              jobId,
              status: job.status,
              newOutput: truncateEnd(collected, CHECK_JOB_OUTPUT_LIMIT),
              ...(job.exitCode !== null ? { exitCode: job.exitCode } : {}),
              ...(waitFor ? { matched } : {}),
              killed: true,
              errorMessage: killResult.errorMessage,
            },
          },
        ]
      }
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
