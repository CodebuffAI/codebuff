import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  __clearJobsForTest,
  __registerJobForTest,
  __sweepOrphanedJobFilesForTest,
  getBackgroundJob,
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

function value(output: Awaited<ReturnType<typeof checkJob>>): any {
  return output[0].value
}

async function withElapsedFollowTimeout<T>(fn: () => Promise<T>): Promise<T> {
  const originalNow = Date.now
  let calls = 0
  Date.now = () => {
    calls += 1
    return calls === 1 ? 1_000 : 2_001
  }
  try {
    return await fn()
  } finally {
    Date.now = originalNow
  }
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

  test('does not follow a job log symlink swapped in before reading', () => {
    const job = makeJob()
    const secretLog = path.join(os.tmpdir(), `openbuff-test-secret-${counter}.log`)
    fs.writeFileSync(secretLog, 'secret\n')
    tempFiles.push(secretLog)
    fs.unlinkSync(job.logFile)
    fs.symlinkSync(secretLog, job.logFile)

    expect(readNewJobOutput(job)).toBe('')
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

  test('follow timeout kills a still-running job by default', async () => {
    let killedSignal: NodeJS.Signals | undefined
    const job = makeJob({
      child: {
        pid: 1234,
        kill: (signal?: NodeJS.Signals | number) => {
          killedSignal = signal as NodeJS.Signals
          return true
        },
      } as unknown as BackgroundJob['child'],
    })

    const result = value(
      await withElapsedFollowTimeout(() =>
        checkJob({
          jobId: job.jobId,
          wait_for: 'never appears',
          timeout_seconds: 1,
        }),
      ),
    )

    expect(killedSignal).toBe('SIGTERM')
    expect(result).toMatchObject({
      jobId: job.jobId,
      status: 'error',
      matched: false,
      killed: true,
    })
    expect(job.status).toBe('error')
  })

  test('follow timeout keeps a running job alive when kill_on_timeout is false', async () => {
    let killCalled = false
    const job = makeJob({
      child: {
        pid: 1234,
        kill: () => {
          killCalled = true
          return true
        },
      } as unknown as BackgroundJob['child'],
    })

    const result = value(
      await withElapsedFollowTimeout(() =>
        checkJob({
          jobId: job.jobId,
          wait_for: 'never appears',
          timeout_seconds: 1,
          kill_on_timeout: false,
        }),
      ),
    )

    expect(killCalled).toBe(false)
    expect(result).toMatchObject({
      jobId: job.jobId,
      status: 'running',
      matched: false,
    })
    expect(result.killed).toBeUndefined()
    expect(job.status).toBe('running')
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

  test('sweeps stale completed job files but preserves running recoverable jobs', () => {
    const oldCompletedJobId = `job-stale-completed-${++counter}`
    const oldRunningJobId = `job-stale-running-${++counter}`
    const oldCompletedLog = path.join(os.tmpdir(), `openbuff-${oldCompletedJobId}.log`)
    const oldCompletedMetadata = path.join(
      os.tmpdir(),
      `openbuff-${oldCompletedJobId}.json`,
    )
    const oldRunningLog = path.join(os.tmpdir(), `openbuff-${oldRunningJobId}.log`)
    const oldRunningMetadata = path.join(
      os.tmpdir(),
      `openbuff-${oldRunningJobId}.json`,
    )
    const oldTime = Date.now() - 25 * 60 * 60 * 1000

    fs.writeFileSync(oldCompletedLog, 'old completed\n')
    fs.writeFileSync(
      oldCompletedMetadata,
      JSON.stringify({
        jobId: oldCompletedJobId,
        command: 'completed job',
        processId: null,
        logFile: oldCompletedLog,
        status: 'completed',
        exitCode: 0,
        startedAt: 123,
      }),
    )
    fs.writeFileSync(oldRunningLog, 'old running\n')
    fs.writeFileSync(
      oldRunningMetadata,
      JSON.stringify({
        jobId: oldRunningJobId,
        command: 'running job',
        processId: process.pid,
        logFile: oldRunningLog,
        status: 'running',
        exitCode: null,
        startedAt: 123,
      }),
    )
    fs.utimesSync(oldCompletedLog, oldTime / 1000, oldTime / 1000)
    fs.utimesSync(oldCompletedMetadata, oldTime / 1000, oldTime / 1000)
    fs.utimesSync(oldRunningLog, oldTime / 1000, oldTime / 1000)
    fs.utimesSync(oldRunningMetadata, oldTime / 1000, oldTime / 1000)
    tempFiles.push(
      oldCompletedLog,
      oldCompletedMetadata,
      oldRunningLog,
      oldRunningMetadata,
    )

    __sweepOrphanedJobFilesForTest()

    expect(fs.existsSync(oldCompletedLog)).toBe(false)
    expect(fs.existsSync(oldCompletedMetadata)).toBe(false)
    expect(fs.existsSync(oldRunningLog)).toBe(true)
    expect(fs.existsSync(oldRunningMetadata)).toBe(true)
  })

  test('recovers a job from persisted metadata and log file', async () => {
    const jobId = `job-recovered-${++counter}`
    const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
    const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
    fs.writeFileSync(logFile, 'ready\n')
    fs.writeFileSync(
      metadataFile,
      JSON.stringify({
        jobId,
        command: 'dev server',
        processId: null,
        logFile,
        status: 'running',
        exitCode: null,
        startedAt: 123,
      }),
    )
    tempFiles.push(logFile, metadataFile)

    const recovered = getBackgroundJob(jobId)
    expect(recovered?.logFile).toBe(logFile)

    const result = value(await checkJob({ jobId }))
    expect(result).toMatchObject({
      jobId,
      status: 'running',
      newOutput: 'ready\n',
    })
  })

  test('recovers persisted read offsets without duplicating historical output', async () => {
    const jobId = `job-recovered-offset-${++counter}`
    const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
    const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
    fs.writeFileSync(logFile, 'first\n')
    fs.writeFileSync(
      metadataFile,
      JSON.stringify({
        jobId,
        command: 'dev server',
        processId: null,
        logFile,
        status: 'running',
        exitCode: null,
        startedAt: 123,
      }),
    )
    tempFiles.push(logFile, metadataFile)

    const first = value(await checkJob({ jobId }))
    expect(first.newOutput).toBe('first\n')
    __clearJobsForTest()

    fs.appendFileSync(logFile, 'second\n')
    const second = value(await checkJob({ jobId }))
    expect(second).toMatchObject({
      jobId,
      status: 'running',
      newOutput: 'second\n',
    })
  })

  test('clamps recovered read offsets beyond the log size', async () => {
    const jobId = `job-recovered-offset-clamp-${++counter}`
    const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
    const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
    fs.writeFileSync(logFile, 'short\n')
    fs.writeFileSync(
      metadataFile,
      JSON.stringify({
        jobId,
        command: 'dev server',
        processId: null,
        logFile,
        status: 'running',
        exitCode: null,
        startedAt: 123,
        readOffset: 10_000,
      }),
    )
    tempFiles.push(logFile, metadataFile)

    const first = value(await checkJob({ jobId }))
    expect(first.newOutput).toBe('')

    fs.appendFileSync(logFile, 'next\n')
    const second = value(await checkJob({ jobId }))
    expect(second.newOutput).toBe('next\n')
  })

  test('falls back to the beginning for invalid or missing recovered read offsets', async () => {
    const cases: Array<{
      suffix: string
      metadataPatch?: { readOffset: unknown }
    }> = [
      { suffix: 'missing' },
      { suffix: 'negative', metadataPatch: { readOffset: -1 } },
      { suffix: 'null', metadataPatch: { readOffset: null } },
      { suffix: 'non-number', metadataPatch: { readOffset: '6' } },
    ]

    for (const testCase of cases) {
      const jobId = `job-recovered-offset-${testCase.suffix}-${++counter}`
      const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
      const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
      fs.writeFileSync(logFile, `${testCase.suffix}\n`)
      fs.writeFileSync(
        metadataFile,
        JSON.stringify({
          jobId,
          command: 'dev server',
          processId: null,
          logFile,
          status: 'running',
          exitCode: null,
          startedAt: 123,
          ...(testCase.metadataPatch ?? {}),
        }),
      )
      tempFiles.push(logFile, metadataFile)

      const result = value(await checkJob({ jobId }))
      expect(result).toMatchObject({
        jobId,
        status: 'running',
        newOutput: `${testCase.suffix}\n`,
      })
      __clearJobsForTest()
    }
  })

  test('does not recover when persisted metadata is a symlink', () => {
    const jobId = `job-metadata-symlink-${++counter}`
    const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
    const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
    const targetMetadataFile = path.join(
      os.tmpdir(),
      `openbuff-test-metadata-target-${counter}.json`,
    )
    fs.writeFileSync(logFile, 'ready\n')
    fs.writeFileSync(
      targetMetadataFile,
      JSON.stringify({
        jobId,
        command: 'dev server',
        processId: null,
        logFile,
        status: 'running',
        exitCode: null,
        startedAt: 123,
      }),
    )
    fs.symlinkSync(targetMetadataFile, metadataFile)
    tempFiles.push(logFile, metadataFile, targetMetadataFile)

    expect(getBackgroundJob(jobId)).toBeUndefined()
  })

  test('does not recover a bare log file without valid metadata', () => {
    const jobId = `job-bare-log-${++counter}`
    const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
    fs.writeFileSync(logFile, 'ready\n')
    tempFiles.push(logFile)

    expect(getBackgroundJob(jobId)).toBeUndefined()
  })
})
