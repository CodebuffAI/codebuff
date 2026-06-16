import { afterEach, describe, expect, test } from 'bun:test'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

import {
  __clearJobsForTest,
  __registerJobForTest,
  type BackgroundJob,
} from '../tools/background-jobs'
import { readLogs } from '../tools/read-logs'

const tempDirs: string[] = []

const makeTempDir = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-read-logs-'))
  tempDirs.push(dir)
  return dir
}

const value = (output: Awaited<ReturnType<typeof readLogs>>): any => output[0].value

afterEach(() => {
  __clearJobsForTest()
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true })
  }
  fs.rmSync(path.join(os.tmpdir(), 'openbuff-read-logs-job.log'), {
    force: true,
  })
  for (const entry of fs.readdirSync(os.tmpdir())) {
    if (entry.startsWith('openbuff-job-read-logs-')) {
      fs.rmSync(path.join(os.tmpdir(), entry), { force: true })
    }
  }
})

describe('readLogs', () => {
  test('returns the requested tail of a file inside cwd', async () => {
    const cwd = makeTempDir()
    fs.writeFileSync(path.join(cwd, 'app.log'), 'one\ntwo\nthree\nfour\n')

    const result = value(
      await readLogs({ cwd, path: 'app.log', lines: 2, max_chars: 1_000 }),
    )

    expect(result.errorMessage).toBeUndefined()
    expect(result.resolvedPath).toBe(path.join(cwd, 'app.log'))
    expect(result.content).toBe('three\nfour\n')
  })

  test('rejects relative paths outside cwd', async () => {
    const cwd = makeTempDir()
    const outside = makeTempDir()
    fs.writeFileSync(path.join(outside, 'secret.log'), 'secret\n')

    const result = value(
      await readLogs({
        cwd,
        path: path.relative(cwd, path.join(outside, 'secret.log')),
      }),
    )

    expect(result.errorMessage).toContain('outside the project directory')
  })

  test('rejects absolute paths outside cwd', async () => {
    const cwd = makeTempDir()
    const outside = makeTempDir()
    const outsideFile = path.join(outside, 'secret.log')
    fs.writeFileSync(outsideFile, 'secret\n')

    const result = value(await readLogs({ cwd, path: outsideFile }))

    expect(result.errorMessage).toContain('outside the project directory')
  })

  test('rejects symlinks that resolve outside cwd', async () => {
    const cwd = makeTempDir()
    const outside = makeTempDir()
    const outsideFile = path.join(outside, 'secret.log')
    fs.writeFileSync(outsideFile, 'secret\n')
    fs.symlinkSync(outsideFile, path.join(cwd, 'link.log'))

    const result = value(await readLogs({ cwd, path: 'link.log' }))

    expect(result.errorMessage).toContain('outside the project directory')
  })

  test('reads a background job log by jobId', async () => {
    const cwd = makeTempDir()
    const logFile = path.join(os.tmpdir(), 'openbuff-read-logs-job.log')
    fs.writeFileSync(logFile, 'alpha\nbeta\ngamma\n')

    const job: BackgroundJob = {
      jobId: 'job-read-logs-test',
      command: 'echo test',
      child: { pid: 1234 } as unknown as BackgroundJob['child'],
      logFile,
      metadataFile: `${logFile}.json`,
      status: 'running',
      exitCode: null,
      startedAt: 0,
      readOffset: 0,
    }
    __registerJobForTest(job)

    const result = value(
      await readLogs({ cwd, jobId: job.jobId, lines: 2, max_chars: 1_000 }),
    )

    expect(result.errorMessage).toBeUndefined()
    expect(result.jobId).toBe(job.jobId)
    expect(result.status).toBe('running')
    expect(result.resolvedPath).toBe(logFile)
    expect(result.content).toBe('beta\ngamma\n')

    fs.rmSync(logFile, { force: true })
  })

  test('does not follow an in-memory background job log symlink swapped in before reading', async () => {
    const cwd = makeTempDir()
    const secretLog = path.join(cwd, 'secret-swap.log')
    const logFile = path.join(os.tmpdir(), 'openbuff-read-logs-job.log')
    fs.writeFileSync(logFile, 'safe\n')
    fs.writeFileSync(secretLog, 'secret\n')

    const job: BackgroundJob = {
      jobId: 'job-read-logs-swap',
      command: 'echo test',
      child: { pid: 1234 } as unknown as BackgroundJob['child'],
      logFile,
      metadataFile: `${logFile}.json`,
      status: 'running',
      exitCode: null,
      startedAt: 0,
      readOffset: 0,
    }
    __registerJobForTest(job)
    fs.rmSync(logFile, { force: true })
    fs.symlinkSync(secretLog, logFile)

    const result = value(await readLogs({ cwd, jobId: job.jobId, lines: 10 }))

    expect(result.errorMessage).toContain('Path is not a regular file')
    expect(result.content).toBeUndefined()
  })

  test('rejects unsafe jobId values without reading derived paths', async () => {
    const cwd = makeTempDir()
    const result = value(
      await readLogs({ cwd, jobId: 'job-read-logs/../../secret', lines: 10 }),
    )

    expect(result.errorMessage).toContain('No background job found')
  })

  test('does not trust recovered background job metadata with an unexpected log path', async () => {
    const cwd = makeTempDir()
    const secretLog = path.join(cwd, 'secret.log')
    const jobId = 'job-read-logs-malicious'
    const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
    fs.writeFileSync(secretLog, 'secret\n')
    fs.writeFileSync(
      metadataFile,
      JSON.stringify({
        jobId,
        command: 'echo test',
        processId: null,
        logFile: secretLog,
        status: 'completed',
        exitCode: 0,
        startedAt: 0,
      }),
    )

    const result = value(await readLogs({ cwd, jobId, lines: 10 }))

    expect(result.errorMessage).toContain('No background job found')
    expect(result.content).toBeUndefined()
  })

  test('rejects recovered background job logs that are symlinks', async () => {
    const cwd = makeTempDir()
    const secretLog = path.join(cwd, 'secret.log')
    const jobId = 'job-read-logs-symlink'
    const logFile = path.join(os.tmpdir(), `openbuff-${jobId}.log`)
    const metadataFile = path.join(os.tmpdir(), `openbuff-${jobId}.json`)
    fs.writeFileSync(secretLog, 'secret\n')
    fs.symlinkSync(secretLog, logFile)
    fs.writeFileSync(
      metadataFile,
      JSON.stringify({
        jobId,
        command: 'echo test',
        processId: null,
        logFile,
        status: 'completed',
        exitCode: 0,
        startedAt: 0,
      }),
    )

    const result = value(await readLogs({ cwd, jobId, lines: 10 }))

    expect(result.errorMessage).toContain('No background job found')
    expect(result.content).toBeUndefined()
  })
})
