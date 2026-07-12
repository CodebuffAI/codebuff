import { spawn } from 'child_process'

import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const DEFAULT_MAX_CHARS = 40_000

export function runGit(
  args: string[],
  cwd: string,
  signal?: AbortSignal,
): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}> {
  if (signal?.aborted) {
    const reason = signal.reason
    return Promise.resolve({
      stdout: '',
      stderr: reason instanceof Error ? reason.message : 'Aborted',
      exitCode: -1,
    })
  }

  return new Promise((resolve) => {
    let child: ReturnType<typeof spawn>
    try {
      child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    } catch (error) {
      resolve({
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        exitCode: -1,
      })
      return
    }

    let stdout = ''
    let stderr = ''
    let settled = false
    let removeAbortListener = () => {}

    const settle = (result: {
      stdout: string
      stderr: string
      exitCode: number
    }) => {
      if (settled) return
      settled = true
      removeAbortListener()
      resolve(result)
    }

    child.stdout?.on('data', (chunk: Buffer) => {
      if (settled) return
      stdout += chunk.toString('utf8')
    })
    child.stderr?.on('data', (chunk: Buffer) => {
      if (settled) return
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      settle({ stdout, stderr: stderr + error.message, exitCode: -1 })
    })
    child.on('close', (code) => {
      settle({ stdout, stderr, exitCode: code ?? -1 })
    })

    if (signal) {
      const onAbort = () => {
        if (settled) return
        const reason = signal.reason
        settle({
          stdout,
          stderr: reason instanceof Error ? reason.message : 'Aborted',
          exitCode: -1,
        })
        try {
          child.kill('SIGTERM')
        } catch {}
      }
      signal.addEventListener('abort', onAbort, { once: true })
      removeAbortListener = () => {
        signal.removeEventListener('abort', onAbort)
      }
    }
  })
}

export async function gitStatus(params: {
  cwd: string
  include_diff?: boolean
  staged?: boolean
  path?: string
  max_chars?: number
  signal?: AbortSignal
}): Promise<CodebuffToolOutput<'git_status'>> {
  const maxChars = Math.min(
    200_000,
    Math.max(500, params.max_chars ?? DEFAULT_MAX_CHARS),
  )
  const statusArgs = ['status', '--short', '--branch']
  if (params.path) {
    const resolvedPath = resolveFilePathWithinProject(params.cwd, params.path)
    if (!resolvedPath) {
      return [
        {
          type: 'json',
          value: {
            errorMessage: `git_status path traversal blocked: "${params.path}" resolves outside the project root.`,
          },
        },
      ]
    }
    statusArgs.push('--', resolvedPath.relativePath)
  }

  const status = await runGit(statusArgs, params.cwd, params.signal)
  if (status.exitCode !== 0) {
    return [
      {
        type: 'json',
        value: {
          errorMessage:
            status.stderr.trim() ||
            `git status exited with code ${status.exitCode}.`,
        },
      },
    ]
  }

  const lines = status.stdout.split('\n')
  const branchLine = lines.find((line) => line.startsWith('## '))
  const branch = branchLine ? branchLine.replace(/^## /, '').trim() : undefined
  const statusBody = lines
    .filter((line) => !line.startsWith('## '))
    .join('\n')
    .trim()

  let diff: string | undefined
  let truncated = false
  if (params.include_diff) {
    const diffArgs = ['diff', '--no-color']
    if (params.staged) diffArgs.splice(1, 0, '--staged')
    if (params.path) {
      const resolvedDiffPath = resolveFilePathWithinProject(
        params.cwd,
        params.path,
      )
      if (!resolvedDiffPath) {
        return [
          {
            type: 'json',
            value: {
              errorMessage: `git_status path traversal blocked: "${params.path}" resolves outside the project root.`,
            },
          },
        ]
      }
      diffArgs.push('--', resolvedDiffPath.relativePath)
    }
    const diffResult = await runGit(diffArgs, params.cwd, params.signal)
    if (diffResult.exitCode !== 0 && diffResult.exitCode !== 1) {
      return [
        {
          type: 'json',
          value: {
            errorMessage:
              diffResult.stderr.trim() ||
              `git diff exited with code ${diffResult.exitCode}.`,
          },
        },
      ]
    }
    diff = diffResult.stdout
    if (diff.length > maxChars) {
      diff =
        diff.slice(0, maxChars) +
        `\n[...truncated ${diff.length - maxChars} chars]`
      truncated = true
    }
  }

  return [
    {
      type: 'json',
      value: {
        ...(branch ? { branch } : {}),
        status: statusBody,
        ...(diff !== undefined ? { diff } : {}),
        ...(truncated ? { truncated: true } : {}),
      },
    },
  ]
}
