import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  __clearJobsForTest,
  __registerJobForTest,
  type BackgroundJob,
} from '../tools/background-jobs'
import { killJob } from '../tools/kill-job'

let counter = 0
const tempFiles: string[] = []

function makeJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  counter += 1
  const logFile = path.join(os.tmpdir(), `openbuff-test-kill-${counter}.log`)
  fs.writeFileSync(logFile, '')
  tempFiles.push(logFile)
  const job: BackgroundJob = {
    jobId: `job-test-${counter}`,
    command: 'echo hi',
    // Fake child with a kill method so killBackgroundJob's `child.kill` path
    // is exercised without spawning a real process.
    child: {
      pid: 53000 + counter,
      kill: () => true,
    } as unknown as BackgroundJob['child'],
    logFile,
    metadataFile: `${logFile}.json`,
    status: 'running',
    exitCode: null,
    startedAt: 0,
    readOffset: 0,
    ...overrides,
  }
  __registerJobForTest(job)
  return job
}

function value(output: Awaited<ReturnType<typeof killJob>>): any {
  return output[0].value
}

afterEach(() => {
  __clearJobsForTest()
  for (const f of tempFiles.splice(0)) {
    try {
      fs.unlinkSync(f)
    } catch {
      // ignore
    }
  }
})

describe('killJob', () => {
  test('returns an errorMessage when the job id is unknown', async () => {
    const out = await killJob({ jobId: 'job-does-not-exist' })
    expect(value(out).errorMessage).toMatch(/No background job found/)
    expect(value(out).jobId).toBe('job-does-not-exist')
  })

  test('kills a running job with SIGTERM by default and reports killed=true', async () => {
    const job = makeJob()
    const out = await killJob({ jobId: job.jobId })
    expect(value(out)).toEqual({
      jobId: job.jobId,
      status: 'error',
      killed: true,
      signal: 'SIGTERM',
      exitCode: null,
    })
  })

  test('honors an explicit SIGKILL signal', async () => {
    const job = makeJob()
    const out = await killJob({ jobId: job.jobId, signal: 'SIGKILL' })
    expect(value(out).signal).toBe('SIGKILL')
    expect(value(out).killed).toBe(true)
  })

  test('does not attempt to kill an already-finished job', async () => {
    const job = makeJob({ status: 'completed', exitCode: 0 })
    const out = await killJob({ jobId: job.jobId })
    expect(value(out)).toEqual({
      jobId: job.jobId,
      status: 'completed',
      killed: false,
      signal: 'SIGTERM',
      exitCode: 0,
    })
  })

  test('returns an errorMessage when the running job has no pid', async () => {
    const job = makeJob({
      child: {
        pid: undefined,
        kill: () => true,
      } as unknown as BackgroundJob['child'],
    })
    const out = await killJob({ jobId: job.jobId })
    expect(value(out).errorMessage).toMatch(/no process id to kill/)
    expect(value(out).jobId).toBe(job.jobId)
  })
})
