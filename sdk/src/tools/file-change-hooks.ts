import fs from 'fs'
import path from 'path'

import micromatch from 'micromatch'

import { loadProviderConfigSync, mergeFileChangeHooks } from '../provider-config'
import { runTerminalCommand } from './run-terminal-command'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

export type FileChangeHook = {
  name?: string
  command: string
  /** Optional glob; the hook runs only when a changed file matches it. */
  filePattern?: string
  /** Optional per-hook override of the default 180s hook timeout, in seconds. */
  timeoutSeconds?: number
}

const HOOK_TIMEOUT_SECONDS = 180
const MAX_HOOK_OUTPUT_CHARS = 6000
const CSHARP_SCAN_EXCLUDED_DIRS = new Set(['.git', 'node_modules', 'dist', 'build'])

type PackageJson = {
  scripts?: Record<string, unknown>
  dependencies?: Record<string, unknown>
  devDependencies?: Record<string, unknown>
}

/**
 * Hooks that should run for this set of changed files: those with no
 * filePattern (always run) or whose glob matches at least one changed file.
 */
export function selectMatchingHooks(
  hooks: FileChangeHook[],
  files: string[],
): FileChangeHook[] {
  return hooks.filter((hook) => {
    if (!hook.filePattern) return true
    if (files.length === 0) return false
    return micromatch.some(files, hook.filePattern)
  })
}

export function inferFileChangeHooks(cwd: string): FileChangeHook[] {
  const hooks: FileChangeHook[] = []

  const packageJson = readPackageJson(path.join(cwd, 'package.json'))
  if (packageJson) hooks.push(...inferPackageJsonHooks(packageJson))

  if (fs.existsSync(path.join(cwd, 'go.mod'))) {
    hooks.push(
      {
        name: 'gofmt',
        command: 'test -z "$(gofmt -l .)"',
        filePattern: '**/*.go',
      },
      {
        name: 'go vet',
        command: 'go vet ./...',
        filePattern: '**/*.go',
      },
    )
  }

  if (hasCsprojFile(cwd)) {
    hooks.push({
      name: 'dotnet format',
      command: 'dotnet format --verify-no-changes',
      filePattern: '**/*.{cs,csproj}',
    })
  }

  if (fs.existsSync(path.join(cwd, 'Cargo.toml'))) {
    hooks.push(
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
    )
  }

  if (
    fs.existsSync(path.join(cwd, 'pyproject.toml')) ||
    fs.existsSync(path.join(cwd, 'requirements.txt'))
  ) {
    hooks.push({
      name: 'ruff',
      command: 'ruff check .',
      filePattern: '**/*.py',
    })
  }

  if (fs.existsSync(path.join(cwd, 'Gemfile'))) {
    hooks.push({
      name: 'rubocop',
      command: 'rubocop',
      filePattern: '**/*.rb',
    })
  }

  if (fs.existsSync(path.join(cwd, 'Package.swift'))) {
    hooks.push({
      name: 'swift-format',
      command: 'swift-format lint --recursive .',
      filePattern: '**/*.swift',
    })
  }

  return hooks
}

function inferPackageJsonHooks(packageJson: PackageJson): FileChangeHook[] {
  const hooks: FileChangeHook[] = []
  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {}),
  }

  if ('eslint' in dependencies) {
    hooks.push({
      name: 'lint',
      command: 'bunx eslint .',
      filePattern: '**/*.{js,jsx,ts,tsx}',
    })
  }

  if ('typescript' in dependencies) {
    hooks.push({
      name: 'typecheck',
      command: 'bunx tsc --noEmit',
      filePattern: '**/*.{ts,tsx}',
    })
  }

  return hooks
}

function readPackageJson(filePath: string): PackageJson | undefined {
  if (!fs.existsSync(filePath)) return undefined
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined
    }
    return parsed as PackageJson
  } catch {
    return undefined
  }
}

function hasCsprojFile(cwd: string): boolean {
  if (!fs.existsSync(cwd) || !fs.statSync(cwd).isDirectory()) return false

  const entries = fs.readdirSync(cwd, { withFileTypes: true })
  for (const entry of entries) {
    const entryPath = path.join(cwd, entry.name)
    if (entry.isFile() && entry.name.endsWith('.csproj')) return true
    if (entry.isDirectory() && !CSHARP_SCAN_EXCLUDED_DIRS.has(entry.name)) {
      if (hasCsprojFile(entryPath)) return true
    }
  }
  return false
}

type RunCommand = typeof runTerminalCommand

/**
 * Run the configured file-change hooks (typecheck/lint/test) for a set of
 * changed files — the verification gate's executor. Returns one result per
 * hook (the terminal output plus a hookName), matching run_file_change_hooks'
 * output schema. `hooks` and `runCommand` are injectable for testing.
 */
export async function runFileChangeHooks(params: {
  files: string[]
  cwd: string
  env?: Record<string, string | undefined>
  hooks?: FileChangeHook[]
  runCommand?: RunCommand
}): Promise<CodebuffToolOutput<'run_file_change_hooks'>> {
  const { files, cwd, env } = params
  const hooks =
    params.hooks ??
    (() => {
      const config = loadProviderConfigSync().config
      if (config.autoFileChangeHooks === false) return config.fileChangeHooks
      return mergeFileChangeHooks(inferFileChangeHooks(cwd), config.fileChangeHooks)
    })()
  const matching = selectMatchingHooks(hooks, files)
  if (hooks.length === 0) {
    return [
      {
        type: 'json',
        value: [
          {
            validationStatus: 'no_hooks_configured',
            message: 'No configured file-change hooks ran.',
            changedFiles: files,
          },
        ],
      },
    ] as CodebuffToolOutput<'run_file_change_hooks'>
  }
  if (matching.length === 0) {
    return [
      {
        type: 'json',
        value: [
          {
            validationStatus: 'hooks_skipped',
            message:
              'Configured file-change hooks were skipped because none matched the changed files.',
            configuredHookCount: hooks.length,
            changedFiles: files,
          },
        ],
      },
    ] as CodebuffToolOutput<'run_file_change_hooks'>
  }

  const run = params.runCommand ?? runTerminalCommand

  // Run matching hooks concurrently. `Promise.allSettled` guarantees every
  // hook runs regardless of others' rejections; results are mapped back into
  // `matching` order so callers see deterministic ordering.
  const settled = await Promise.allSettled(
    matching.map((hook) => {
      const hookName = hook.name ?? hook.command
      return run({
        command: hook.command,
        process_type: 'SYNC',
        cwd,
        projectRoot: cwd,
        timeout_seconds: hook.timeoutSeconds ?? HOOK_TIMEOUT_SECONDS,
        env,
      })
        .then((out) => {
          const first = Array.isArray(out) ? out[0] : undefined
          if (
            first &&
            first.type === 'json' &&
            first.value &&
            typeof first.value === 'object'
          ) {
            const value = first.value as Record<string, unknown>
            return {
              ...value,
              stdout: truncate(value.stdout),
              stderr: truncate(value.stderr),
              hookName,
            }
          }
          return { errorMessage: `Hook "${hookName}" produced no output.` }
        })
        .catch((err: unknown) => ({
          errorMessage: `Hook "${hookName}" failed to run: ${
            err instanceof Error ? err.message : String(err)
          }`,
        }))
    }),
  )

  const results: Array<Record<string, unknown>> = settled.map((s) =>
    s.status === 'fulfilled'
      ? (s.value as Record<string, unknown>)
      : {
          errorMessage: `Hook failed to run: ${
            s.reason instanceof Error ? s.reason.message : String(s.reason)
          }`,
        },
  )

  return [{ type: 'json', value: results }] as CodebuffToolOutput<'run_file_change_hooks'>
}

function truncate(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.length > MAX_HOOK_OUTPUT_CHARS
    ? value.slice(0, MAX_HOOK_OUTPUT_CHARS) + '\n…[truncated]'
    : value
}
