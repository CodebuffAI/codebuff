import { describe, expect, test } from 'bun:test'

import {
  runFileChangeHooks,
  selectMatchingHooks,
  type FileChangeHook,
} from '../tools/file-change-hooks'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

function fakeRunner(
  exitByCommand: Record<string, { exitCode: number; stdout?: string; stderr?: string }>,
) {
  const calls: string[] = []
  const run = (async (params: { command: string }) => {
    calls.push(params.command)
    const r = exitByCommand[params.command] ?? { exitCode: 0 }
    return [
      {
        type: 'json' as const,
        value: { exitCode: r.exitCode, stdout: r.stdout ?? '', stderr: r.stderr ?? '' },
      },
    ] as CodebuffToolOutput<'run_terminal_command'>
  }) as any
  return { run, calls }
}

const hooks: FileChangeHook[] = [
  { name: 'typecheck', command: 'tsc --noEmit' },
  { name: 'test-ts', command: 'bun test', filePattern: '**/*.ts' },
  { name: 'test-py', command: 'pytest', filePattern: '**/*.py' },
]

describe('selectMatchingHooks', () => {
  test('no filePattern always runs; glob matches a changed file', () => {
    const m = selectMatchingHooks(hooks, ['src/a.ts'])
    expect(m.map((h) => h.name)).toEqual(['typecheck', 'test-ts'])
  })
  test('non-matching glob is excluded', () => {
    const m = selectMatchingHooks(hooks, ['src/a.py'])
    expect(m.map((h) => h.name)).toEqual(['typecheck', 'test-py'])
  })
  test('empty files runs only pattern-less hooks', () => {
    const m = selectMatchingHooks(hooks, [])
    expect(m.map((h) => h.name)).toEqual(['typecheck'])
  })
})

function jsonValue(
  out: CodebuffToolOutput<'run_file_change_hooks'>,
): Record<string, unknown>[] | undefined {
  const first = Array.isArray(out) ? out[0] : undefined
  return first && first.type === 'json'
    ? (first.value as Record<string, unknown>[])
    : undefined
}

describe('runFileChangeHooks', () => {
  test('reports when no hooks are configured without invoking a runner', async () => {
    const { run, calls } = fakeRunner({})
    const out = await runFileChangeHooks({
      files: ['src/a.ts'],
      cwd: '/repo',
      hooks: [],
      runCommand: run,
    })

    expect(calls).toEqual([])
    expect(jsonValue(out)).toEqual([
      {
        validationStatus: 'no_hooks_configured',
        message: 'No configured file-change hooks ran.',
        changedFiles: ['src/a.ts'],
      },
    ])
  })

  test('runs matching hooks and reports per-hook exit codes', async () => {
    const { run, calls } = fakeRunner({
      'tsc --noEmit': { exitCode: 0 },
      'bun test': { exitCode: 1, stderr: '1 test failed' },
    })
    const out = await runFileChangeHooks({
      files: ['src/a.ts'],
      cwd: '/repo',
      hooks,
      runCommand: run,
    })
    expect(calls).toEqual(['tsc --noEmit', 'bun test']) // py hook not matched
    const results = jsonValue(out)
    expect(results).toBeDefined()
    expect(results).toHaveLength(2)
    expect(results![0]).toMatchObject({ hookName: 'typecheck', exitCode: 0 })
    expect(results![1]).toMatchObject({ hookName: 'test-ts', exitCode: 1 })
    // A consumer (the gate) can detect failure via exitCode !== 0.
    expect(results!.some((r) => r.exitCode !== 0)).toBe(true)
  })

  test('reports successful matching hooks', async () => {
    const { run, calls } = fakeRunner({
      'tsc --noEmit': { exitCode: 0, stdout: 'ok' },
    })
    const out = await runFileChangeHooks({
      files: ['README.md'],
      cwd: '/repo',
      hooks,
      runCommand: run,
    })

    expect(calls).toEqual(['tsc --noEmit'])
    expect(jsonValue(out)).toEqual([
      { hookName: 'typecheck', exitCode: 0, stdout: 'ok', stderr: '' },
    ])
  })

  test('reports when configured hooks are skipped because none match', async () => {
    const { run, calls } = fakeRunner({})
    const out = await runFileChangeHooks({
      files: ['README.md'],
      cwd: '/repo',
      hooks: [{ command: 'tsc', filePattern: '**/*.ts' }],
      runCommand: run,
    })
    expect(calls).toEqual([])
    expect(jsonValue(out)).toEqual([
      {
        validationStatus: 'hooks_skipped',
        message:
          'Configured file-change hooks were skipped because none matched the changed files.',
        configuredHookCount: 1,
        changedFiles: ['README.md'],
      },
    ])
  })
})
