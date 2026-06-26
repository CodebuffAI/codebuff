import { spawn } from 'child_process'

import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'

const DEFAULT_MAX_CHARS = 40_000

function runGit(args: string[], cwd: string): Promise<{
  stdout: string
  stderr: string
  exitCode: number
}> {
  return new Promise((resolve) => {
    const child = spawn('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8')
    })
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8')
    })
    child.on('error', (error) => {
      resolve({ stdout, stderr: stderr + error.message, exitCode: -1 })
    })
    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? -1 })
    })
  })
}

export async function gitStatus(params: {
  cwd: string
  include_diff?: boolean
  staged?: boolean
  path?: string
  max_chars?: number
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

  const status = await runGit(statusArgs, params.cwd)
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
  const statusBody = lines.filter((line) => !line.startsWith('## ')).join('\n').trim()

  let diff: string | undefined
  let truncated = false
  if (params.include_diff) {
    const diffArgs = ['diff', '--no-color']
    if (params.staged) diffArgs.splice(1, 0, '--staged')
    if (params.path) {
      const resolvedDiffPath = resolveFilePathWithinProject(params.cwd, params.path)
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
    const diffResult = await runGit(diffArgs, params.cwd)
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
      diff = diff.slice(0, maxChars) + `\n[...truncated ${diff.length - maxChars} chars]`
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
