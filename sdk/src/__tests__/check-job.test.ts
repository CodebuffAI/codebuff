import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  __clearJobsForTest,
  __registerJobForTest,
  readNewJobOutput,
  type BackgroundJob,
} from '../tools/background-jobs'
import { checkJob } from '../tools/check-job'

let counter = 0
const tempFiles: string[] = []

function makeJob(overrides: Partial<BackgroundJob> = {}): BackgroundJob {
  counter += 1
  const logFile = path.join(os.tmpdir(), `openbuff-test-job-${counter}.log`)
  fs.writeFileSync(logFile, '')
  tempFiles.push(logFile)
  const job: BackgroundJob = {
    jobId: `job-test-${counter}`,
    command: 'echo hi',
    child: { pid: 1234 } as unknown as BackgroundJob['child'],
    logFile,
    status: 'running',
    exitCode: null,
    startedAt: 0,
    readOffset: 0,
    ...overrides,
  }
  __registerJobForTest(job)
  return job
}

function value(output: Awaited<ReturnType<typeof checkJob>>): any {
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

describe('readNewJobOutput', () => {
  test('returns only the bytes appended since the previous read', () => {
    const job = makeJob()
    fs.appendFileSync(job.logFile, 'hello\n')
    expect(readNewJobOutput(job)).toBe('hello\n')
    // Nothing new yet.
    expect(readNewJobOutput(job)).toBe('')
    fs.appendFileSync(job.logFile, 'world\n')
    expect(readNewJobOutput(job)).toBe('world\n')
  })
})

describe('checkJob', () => {
  test('poll mode returns new output and running status without repeating', async () => {
    const job = makeJob()
    fs.appendFileSync(job.logFile, 'line one\n')

    const first = value(await checkJob({ jobId: job.jobId }))
    expect(first).toMatchObject({
      jobId: job.jobId,
      status: 'running',
      newOutput: 'line one\n',
    })
    expect(first.matched).toBeUndefined()

    fs.appendFileSync(job.logFile, 'line two\n')
    const second = value(await checkJob({ jobId: job.jobId }))
    expect(second.newOutput).toBe('line two\n')
  })

  test('follow mode returns matched=true once the pattern is present', async () => {
    const job = makeJob()
    fs.appendFileSync(job.logFile, 'starting...\nListening on :3000\n')

    const result = value(
      await checkJob({
        jobId: job.jobId,
        wait_for: 'Listening on',
        timeout_seconds: 1,
      }),
    )
    expect(result.matched).toBe(true)
    expect(result.newOutput).toContain('Listening on :3000')
  })

  test('reports completed status and exit code', async () => {
    const job = makeJob({ status: 'completed', exitCode: 0 })
    fs.appendFileSync(job.logFile, 'done\n')
    const result = value(await checkJob({ jobId: job.jobId }))
    expect(result).toMatchObject({ status: 'completed', exitCode: 0 })
  })

  test('returns an error for an unknown job id', async () => {
    const result = value(await checkJob({ jobId: 'does-not-exist' }))
    expect(result.errorMessage).toContain('does-not-exist')
  })
})
