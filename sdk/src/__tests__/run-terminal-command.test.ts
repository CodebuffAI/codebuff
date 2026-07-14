import fs from 'fs'
import os from 'os'
import path from 'path'
import { describe, expect, it } from 'bun:test'

import { getBackgroundJob, killBackgroundJob } from '../tools/background-jobs'
import {
  findWindowsBash,
  runTerminalCommand,
} from '../tools/run-terminal-command'

describe('Windows bash prerequisite', () => {
  it('honors the Openbuff-specific Git Bash override', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuff-bash-'))
    const bashPath = path.join(dir, 'bash.exe')
    fs.writeFileSync(bashPath, '')
    try {
      expect(findWindowsBash({ OPENBUFF_GIT_BASH_PATH: bashPath })).toBe(
        bashPath,
      )
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('runTerminalCommand cwd containment', () => {
  it('returns a structured timeout result with partial output', async () => {
    const result = await runTerminalCommand({
      command: 'printf started; sleep 30',
      process_type: 'SYNC',
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      timeout_seconds: 0.05,
    })
    const value = result[0].value as {
      timedOut?: boolean
      errorMessage?: string
      stdout?: string
    }

    expect(value.timedOut).toBe(true)
    expect(value.errorMessage).toContain('timed out')
    expect(value.stdout).toContain('started')
  })

  it('cancels an owned background job when the request aborts', async () => {
    const controller = new AbortController()
    const result = await runTerminalCommand({
      command: 'sleep 30',
      process_type: 'BACKGROUND',
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      timeout_seconds: 5,
      signal: controller.signal,
    })
    const value = result[0].value as { jobId?: string; detached?: boolean }
    expect(value.detached).toBe(false)
    expect(value.jobId).toBeDefined()

    controller.abort()
    await new Promise((resolve) => setTimeout(resolve, 20))
    const job = getBackgroundJob(value.jobId!)
    expect(job?.status).toBe('error')
    killBackgroundJob(value.jobId!, 'SIGKILL')
  })

  it('terminates a background job that exceeds the bounded log quota', async () => {
    const result = await runTerminalCommand({
      command: 'yes x | head -c 12000000; sleep 30',
      process_type: 'BACKGROUND',
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      timeout_seconds: 5,
    })
    const value = result[0].value as { jobId?: string }
    expect(value.jobId).toBeDefined()

    const deadline = Date.now() + 5_000
    let job = getBackgroundJob(value.jobId!)
    while (job?.status === 'running' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25))
      job = getBackgroundJob(value.jobId!)
    }

    expect(job?.status).toBe('error')
    expect(fs.statSync(job!.logFile).size).toBeLessThanOrEqual(10 * 1024 * 1024)
    killBackgroundJob(value.jobId!, 'SIGKILL')
  })

  it('accepts the project root itself as cwd', async () => {
    const result = await runTerminalCommand({
      command: 'pwd',
      process_type: 'SYNC',
      cwd: process.cwd(),
      projectRoot: process.cwd(),
      timeout_seconds: 5,
    })
    const value = result[0].value as { errorMessage?: string; stdout?: string }
    expect(value.errorMessage).toBeUndefined()
    expect(value.stdout).toContain(process.cwd())
  })

  it('rejects an absolute cwd outside the project with a structured error', async () => {
    const result = await runTerminalCommand({
      command: 'echo hello',
      process_type: 'SYNC',
      cwd: '/etc',
      timeout_seconds: 5,
    })
    const value = result[0].value as { errorMessage?: string; command?: string }
    expect(value.errorMessage).toContain('Invalid cwd')
    expect(value.errorMessage).toContain('/etc')
    expect(value.errorMessage).toContain('outside the project directory')
  })

  it('rejects a parent-traversal cwd with a structured error', async () => {
    const result = await runTerminalCommand({
      command: 'echo hello',
      process_type: 'SYNC',
      cwd: '../../outside',
      timeout_seconds: 5,
    })
    const value = result[0].value as { errorMessage?: string }
    expect(value.errorMessage).toContain('Invalid cwd')
    expect(value.errorMessage).toContain('outside the project directory')
  })

  it('rejects a BACKGROUND process whose cwd escapes the project', async () => {
    const result = await runTerminalCommand({
      command: 'echo hello',
      process_type: 'BACKGROUND',
      cwd: '/etc',
      timeout_seconds: 5,
    })
    const value = result[0].value as { errorMessage?: string }
    expect(value.errorMessage).toContain('Invalid cwd')
    expect(value.errorMessage).toContain('outside the project directory')
  })

  it('rejects a BACKGROUND process whose cwd escapes the explicit project root', async () => {
    const result = await runTerminalCommand({
      command: 'echo hello',
      process_type: 'BACKGROUND',
      cwd: '/etc',
      projectRoot: process.cwd(),
      timeout_seconds: 5,
    })
    const value = result[0].value as { errorMessage?: string }
    expect(value.errorMessage).toContain('Invalid cwd')
    expect(value.errorMessage).toContain('outside the project directory')
  })

  it('preserves the command field in the error result for debugging', async () => {
    const result = await runTerminalCommand({
      command: 'rm -rf /',
      process_type: 'SYNC',
      cwd: '/etc',
      timeout_seconds: 5,
    })
    const value = result[0].value as { errorMessage?: string; command?: string }
    expect(value.command).toBe('rm -rf /')
  })

  it('runs inside the dereferenced target of an in-project cwd symlink', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-root-'))
    try {
      const realDirectory = path.join(projectRoot, 'real')
      fs.mkdirSync(realDirectory)
      fs.symlinkSync(realDirectory, path.join(projectRoot, 'link'))

      const result = await runTerminalCommand({
        command: 'pwd -P',
        process_type: 'SYNC',
        cwd: 'link',
        projectRoot,
        timeout_seconds: 5,
      })
      const value = result[0].value as {
        errorMessage?: string
        stdout?: string
      }

      expect(value.errorMessage).toBeUndefined()
      expect(value.stdout?.trim()).toBe(fs.realpathSync(realDirectory))
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
    }
  })

  it('rejects a cwd symlink that resolves outside the project root', async () => {
    const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'terminal-root-'))
    const outsideRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'terminal-outside-'),
    )
    try {
      fs.symlinkSync(outsideRoot, path.join(projectRoot, 'escape'))

      const result = await runTerminalCommand({
        command: 'pwd',
        process_type: 'SYNC',
        cwd: 'escape',
        projectRoot,
        timeout_seconds: 5,
      })
      const value = result[0].value as { errorMessage?: string }

      expect(value.errorMessage).toContain('outside the project directory')
    } finally {
      fs.rmSync(projectRoot, { recursive: true, force: true })
      fs.rmSync(outsideRoot, { recursive: true, force: true })
    }
  })
})
