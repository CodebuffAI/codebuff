import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'fs'
import { tmpdir } from 'os'
import path from 'path'

import { describe, expect, test } from 'bun:test'

import {
  inferFileChangeHooks,
  runFileChangeHooks,
  selectMatchingHooks,
  type FileChangeHook,
} from '../tools/file-change-hooks'
import { mergeFileChangeHooks } from '../provider-config'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

function withTempDir(run: (dir: string) => void): void {
  const dir = mkdtempSync(path.join(tmpdir(), 'openbuff-hooks-'))
  try {
    run(dir)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

function fakeRunner(
  exitByCommand: Record<string, { exitCode: number; stdout?: string; stderr?: string }>,
) {
  const calls: string[] = []
  const paramsList: Array<Record<string, unknown>> = []
  const run = (async (params: Record<string, unknown>) => {
    calls.push(params.command as string)
    paramsList.push(params)
    const r = exitByCommand[params.command as string] ?? { exitCode: 0 }
    return [
      {
        type: 'json' as const,
        value: { exitCode: r.exitCode, stdout: r.stdout ?? '', stderr: r.stderr ?? '' },
      },
    ] as CodebuffToolOutput<'run_terminal_command'>
  }) as any
  return { run, calls, paramsList }
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

  test('normalizes missing hook stdout and stderr to JSON-safe strings', async () => {
    const run = (async () => [
      {
        type: 'json' as const,
        value: { exitCode: 0, stdout: undefined, stderr: undefined },
      },
    ]) as any

    const out = await runFileChangeHooks({
      files: ['README.md'],
      cwd: '/repo',
      hooks: [{ name: 'typecheck', command: 'tsc --noEmit' }],
      runCommand: run,
    })

    expect(jsonValue(out)).toEqual([
      { hookName: 'typecheck', exitCode: 0, stdout: '', stderr: '' },
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

  test('runs matching hooks in parallel and preserves result order', async () => {
    // The first matching hook (typecheck) is intentionally slower so it
    // completes after the second (test-ts). This exercises out-of-order
    // completion while asserting results stay in `matching` order.
    const completionOrder: string[] = []
    const run = (async (params: { command: string }) => {
      if (params.command === 'tsc --noEmit') {
        await new Promise((resolve) => setTimeout(resolve, 50))
        completionOrder.push('typecheck')
      } else {
        completionOrder.push('test-ts')
      }
      return [
        {
          type: 'json' as const,
          value: { exitCode: 0, stdout: '', stderr: '' },
        },
      ] as CodebuffToolOutput<'run_terminal_command'>
    }) as any
    const out = await runFileChangeHooks({
      files: ['src/a.ts'],
      cwd: '/repo',
      hooks,
      runCommand: run,
    })
    const results = jsonValue(out)
    expect(results).toBeDefined()
    expect(results).toHaveLength(2)
    // Completion happened out of order: test-ts finished before typecheck.
    expect(completionOrder).toEqual(['test-ts', 'typecheck'])
    // ...but results are in `matching` order regardless of completion order.
    expect(results![0]).toMatchObject({ hookName: 'typecheck', exitCode: 0 })
    expect(results![1]).toMatchObject({ hookName: 'test-ts', exitCode: 0 })
  })

  test('forwards per-hook timeoutSeconds to runCommand', async () => {
    const { run, paramsList } = fakeRunner({
      tsc: { exitCode: 0 },
    })
    const out = await runFileChangeHooks({
      files: ['src/a.ts'],
      cwd: '/repo',
      hooks: [{ name: 'slow', command: 'tsc', timeoutSeconds: 30 }],
      runCommand: run,
    })
    const results = jsonValue(out)
    expect(results).toBeDefined()
    expect(results).toHaveLength(1)
    expect(results![0]).toMatchObject({ hookName: 'slow', exitCode: 0 })
    // The configured timeout (30s) is forwarded, not the 180s default.
    expect(paramsList).toHaveLength(1)
    expect(paramsList[0]).toMatchObject({
      command: 'tsc',
      timeout_seconds: 30,
    })
  })
})

describe('inferFileChangeHooks', () => {
  test('infers JavaScript lint and typecheck hooks from package dependencies without running package scripts', () => {
    withTempDir((dir) => {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          scripts: { lint: 'custom-lint', typecheck: 'custom-typecheck' },
          devDependencies: { eslint: '^9.0.0', typescript: '^5.0.0' },
        }),
      )

      expect(inferFileChangeHooks(dir)).toEqual([
        {
          name: 'lint',
          command: 'bunx eslint .',
          filePattern: '**/*.{js,jsx,ts,tsx}',
        },
        {
          name: 'typecheck',
          command: 'bunx tsc --noEmit',
          filePattern: '**/*.{ts,tsx}',
        },
      ])
    })
  })

  test('does not infer package script hooks when matching dependencies are absent', () => {
    withTempDir((dir) => {
      writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({ scripts: { lint: 'eslint .', typecheck: 'tsc --noEmit' } }),
      )

      expect(inferFileChangeHooks(dir)).toEqual([])
    })
  })

  test('ignores malformed package.json while preserving other inferred hooks', () => {
    withTempDir((dir) => {
      writeFileSync(path.join(dir, 'package.json'), '{bad json')
      writeFileSync(path.join(dir, 'go.mod'), 'module demo\n')

      expect(inferFileChangeHooks(dir)).toEqual([
        {
          name: 'gofmt',
          command: 'test -z "$(gofmt -l .)"',
          filePattern: '**/*.go',
        },
        { name: 'go vet', command: 'go vet ./...', filePattern: '**/*.go' },
      ])
    })
  })

  test('infers non-mutating default linter hooks from language manifests', () => {
    withTempDir((dir) => {
      writeFileSync(path.join(dir, 'Cargo.toml'), '[package]\nname = "demo"\n')
      writeFileSync(path.join(dir, 'requirements.txt'), 'ruff\n')
      writeFileSync(path.join(dir, 'go.mod'), 'module demo\n')
      writeFileSync(path.join(dir, 'Gemfile'), 'source "https://rubygems.org"\n')
      writeFileSync(path.join(dir, 'Package.swift'), '// swift-tools-version: 5.9\n')
      mkdirSync(path.join(dir, 'app'))
      writeFileSync(path.join(dir, 'app', 'Demo.csproj'), '<Project />\n')

      expect(inferFileChangeHooks(dir)).toEqual([
        {
          name: 'gofmt',
          command: 'test -z "$(gofmt -l .)"',
          filePattern: '**/*.go',
        },
        { name: 'go vet', command: 'go vet ./...', filePattern: '**/*.go' },
        {
          name: 'dotnet format',
          command: 'dotnet format --verify-no-changes',
          filePattern: '**/*.{cs,csproj}',
        },
        {
          name: 'cargo fmt',
          command: 'cargo fmt --check',
          filePattern: '**/*.rs',
        },
        {
          name: 'cargo clippy',
          command: 'cargo clippy --all-targets --all-features -- -D warnings',
          filePattern: '**/*.rs',
        },
        { name: 'ruff', command: 'ruff check .', filePattern: '**/*.py' },
        { name: 'rubocop', command: 'rubocop', filePattern: '**/*.rb' },
        {
          name: 'swift-format',
          command: 'swift-format lint --recursive .',
          filePattern: '**/*.swift',
        },
      ])
    })
  })
})

describe('mergeFileChangeHooks — concat-with-dedup (R3c)', () => {
  test('returns [] when both base and override are empty', () => {
    expect(mergeFileChangeHooks([], [])).toEqual([])
    expect(mergeFileChangeHooks(undefined, undefined)).toEqual([])
  })

  test('appends override-only entries after base entries (base-first ordering)', () => {
    const base: FileChangeHook[] = [
      { name: 'typecheck', command: 'tsc --noEmit' },
    ]
    const override: FileChangeHook[] = [
      { name: 'lint', command: 'eslint .', filePattern: 'src/**' },
    ]
    const merged = mergeFileChangeHooks(base, override)
    expect(merged.map((h) => h.name)).toEqual(['typecheck', 'lint'])
  })

  test('override entry wins on conflict and keeps the base entry position', () => {
    const base: FileChangeHook[] = [
      {
        name: 'typecheck',
        command: 'tsc --noEmit',
        filePattern: 'src/**/*.ts',
      },
    ]
    const override: FileChangeHook[] = [
      {
        name: 'typecheck',
        command: 'tsc --noEmit',
        filePattern: 'src/**/*.ts',
        timeoutSeconds: 60,
      },
    ]
    const merged = mergeFileChangeHooks(base, override)
    expect(merged).toHaveLength(1)
    // Override wins: the per-hook timeout from the override entry is preserved
    // in the base entry's slot (project tunes a global hook without reordering).
    expect(merged[0]).toEqual({
      name: 'typecheck',
      command: 'tsc --noEmit',
      filePattern: 'src/**/*.ts',
      timeoutSeconds: 60,
    })
  })

  test('dedups by command + filePattern + name across base and override', () => {
    const base: FileChangeHook[] = [
      { name: 'typecheck', command: 'tsc --noEmit' },
      { name: 'typecheck', command: 'tsc --noEmit' }, // exact dup within base
      { name: 'lint', command: 'eslint .' },
    ]
    const override: FileChangeHook[] = [
      { name: 'typecheck', command: 'tsc --noEmit', timeoutSeconds: 90 },
      { name: 'test', command: 'bun test' },
    ]
    const merged = mergeFileChangeHooks(base, override)
    // base typecheck (first slot, overridden → override entry), base lint, override test
    expect(merged.map((h) => h.name)).toEqual(['typecheck', 'lint', 'test'])
    expect(merged[0]).toMatchObject({ timeoutSeconds: 90 })
  })
})
