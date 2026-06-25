import micromatch from 'micromatch'

import { loadProviderConfigSync } from '../provider-config'
import { runTerminalCommand } from './run-terminal-command'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

export type FileChangeHook = {
  name?: string
  command: string
  /** Optional glob; the hook runs only when a changed file matches it. */
  filePattern?: string
}

const HOOK_TIMEOUT_SECONDS = 180
const MAX_HOOK_OUTPUT_CHARS = 6000

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
    params.hooks ?? loadProviderConfigSync().config.fileChangeHooks ?? []
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
  const results: Array<Record<string, unknown>> = []
  for (const hook of matching) {
    const hookName = hook.name ?? hook.command
    try {
      const out = await run({
        command: hook.command,
        process_type: 'SYNC',
        cwd,
        timeout_seconds: HOOK_TIMEOUT_SECONDS,
        env,
      })
      const first = Array.isArray(out) ? out[0] : undefined
      if (first && first.type === 'json' && first.value && typeof first.value === 'object') {
        const value = first.value as Record<string, unknown>
        results.push({
          ...value,
          stdout: truncate(value.stdout),
          stderr: truncate(value.stderr),
          hookName,
        })
      } else {
        results.push({ errorMessage: `Hook "${hookName}" produced no output.` })
      }
    } catch (err) {
      results.push({
        errorMessage: `Hook "${hookName}" failed to run: ${
          err instanceof Error ? err.message : String(err)
        }`,
      })
    }
  }

  return [{ type: 'json', value: results }] as CodebuffToolOutput<'run_file_change_hooks'>
}

function truncate(value: unknown): unknown {
  if (typeof value !== 'string') return value
  return value.length > MAX_HOOK_OUTPUT_CHARS
    ? value.slice(0, MAX_HOOK_OUTPUT_CHARS) + '\n…[truncated]'
    : value
}
