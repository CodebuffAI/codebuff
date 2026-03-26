import fs from 'fs'
import os from 'os'
import path from 'path'
import { execSync } from 'child_process'

import { afterEach, beforeEach, describe, expect, it } from 'bun:test'

import { runCliAgent } from '../cli-runner'

let tmpDir: string

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalbuff-cli-test-'))
  // Initialize a git repo so git diff works
  execSync('git init && git add . && git commit --allow-empty -m "init"', {
    cwd: tmpDir,
    stdio: 'ignore',
  })
})

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true })
})

describe('runCliAgent', () => {
  it('happy path: captures stdout and exit code 0', async () => {
    const result = await runCliAgent({
      command: 'echo',
      prompt: 'hello world',
      cwd: tmpDir,
      timeoutMs: 10_000,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe('hello world')
    expect(result.durationMs).toBeGreaterThan(0)
  })

  it('captures git diff when agent creates a file', async () => {
    // Use a bash command that creates a file
    const scriptPath = path.join(tmpDir, 'agent.sh')
    fs.writeFileSync(
      scriptPath,
      '#!/bin/bash\necho "new content" > newfile.txt\n',
    )
    fs.chmodSync(scriptPath, '755')

    const result = await runCliAgent({
      command: scriptPath,
      prompt: 'create a file',
      cwd: tmpDir,
      timeoutMs: 10_000,
    })

    expect(result.exitCode).toBe(0)
    expect(result.diff).toContain('newfile.txt')
    expect(result.diff).toContain('new content')
  })

  it('handles agent crash with non-zero exit code', async () => {
    const result = await runCliAgent({
      command: 'bash -c',
      prompt: 'exit 42',
      cwd: tmpDir,
      timeoutMs: 10_000,
    })

    expect(result.exitCode).toBe(42)
  })

  it('returns empty diff when agent makes no changes', async () => {
    const result = await runCliAgent({
      command: 'echo',
      prompt: 'do nothing',
      cwd: tmpDir,
      timeoutMs: 10_000,
    })

    expect(result.diff).toBe('')
  })

  it('rejects when agent CLI is not found', async () => {
    const promise = runCliAgent({
      command: 'nonexistent-agent-binary-xyz',
      prompt: 'test',
      cwd: tmpDir,
      timeoutMs: 10_000,
    })

    await expect(promise).rejects.toThrow('CLI agent failed to start')
    await expect(promise).rejects.toThrow('nonexistent-agent-binary-xyz')
  })

  it('kills agent on timeout', async () => {
    const result = await runCliAgent({
      command: 'sleep',
      prompt: '30',
      cwd: tmpDir,
      timeoutMs: 500, // 500ms timeout
    })

    // Process should have been killed
    expect(result.durationMs).toBeLessThan(5000)
    // Exit code is null when killed by signal, which becomes 1
    expect(result.exitCode).not.toBe(0)
  })
})
