import { EventEmitter } from 'events'

import { describe, expect, it } from 'bun:test'

import { getGitChanges } from '../run-state'

import type { CodebuffSpawn } from '@codebuff/common/types/spawn'
import type { Logger } from '@codebuff/common/types/contracts/logger'

/** Fake ChildProcess: streams the given stdout in fixed-size chunks after
 *  spawn returns, then closes with code 0 — unless killed first, in which
 *  case it closes with a null code like a real SIGTERM'd child. */
function fakeProc(stdout: string, chunkSize = 1_000_000) {
  const proc = new EventEmitter() as any
  proc.stdout = new EventEmitter()
  proc.stderr = new EventEmitter()
  let killed = false
  proc.kill = () => {
    killed = true
    setImmediate(() => proc.emit('close', null))
    return true
  }
  setImmediate(() => {
    for (let i = 0; i < stdout.length; i += chunkSize) {
      if (killed) return
      proc.stdout.emit('data', Buffer.from(stdout.slice(i, i + chunkSize)))
    }
    if (!killed) proc.emit('close', 0)
  })
  return proc
}

function makeLogger(events: Array<{ data: unknown; msg?: string }>): Logger {
  const record = (data: unknown, msg?: string) => events.push({ data, msg })
  return { debug: record, info: record, warn: record, error: record }
}

function makeSpawn(outputs: Record<string, string>): CodebuffSpawn {
  return ((command: string, args?: readonly string[]) => {
    const key = [command, ...(args ?? [])].join(' ')
    return fakeProc(outputs[key] ?? '')
  }) as CodebuffSpawn
}

describe('getGitChanges', () => {
  it('returns full output when under the cap', async () => {
    const events: Array<{ data: unknown; msg?: string }> = []
    const result = await getGitChanges({
      cwd: '/repo',
      spawn: makeSpawn({
        'git status': 'On branch main\n',
        'git diff': 'diff --git a/x b/x\n+hello\n',
        'git diff --cached': '',
      }),
      logger: makeLogger(events),
    })

    expect(result.status).toBe('On branch main\n')
    expect(result.diff).toBe('diff --git a/x b/x\n+hello\n')
    expect(result.diffCached).toBe('')
    expect(events).toEqual([])
  })

  it('caps a huge diff instead of buffering it unbounded', async () => {
    // ~30MB diff vs the 10M-char cap. The pre-fix behavior accumulated all of
    // it (real-world multi-GB diffs hit the runtime string ceiling and threw
    // RangeError: Out of memory).
    const hugeDiff = 'x'.repeat(30_000_000)
    const events: Array<{ data: unknown; msg?: string }> = []

    const result = await getGitChanges({
      cwd: '/repo',
      spawn: makeSpawn({ 'git diff': hugeDiff }),
      logger: makeLogger(events),
    })

    // Truncated prefix + marker resolved — not rejected-and-folded to ''.
    expect(result.diff.length).toBe(10_000_000 + '\n[output truncated]'.length)
    expect(result.diff.endsWith('\n[output truncated]')).toBe(true)
    expect(result.diff.startsWith('xxx')).toBe(true)

    // Other commands are unaffected.
    expect(result.status).toBe('')

    // Truncation is logged with the offending command.
    const truncationLogs = events.filter(
      (e) => e.msg === 'Git command output truncated at cap',
    )
    expect(truncationLogs.length).toBe(1)
    expect((truncationLogs[0]!.data as any).command).toBe('git diff')
  })
})
