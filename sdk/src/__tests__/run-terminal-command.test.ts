import { describe, expect, it } from 'bun:test'

import { runTerminalCommand } from '../tools/run-terminal-command'

describe('runTerminalCommand cwd containment', () => {
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
})
